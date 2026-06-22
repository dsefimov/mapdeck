import type {
    CachedNode,
    BudgetPlan,
    PointCloudData,
} from "@core/framework/types";
import type { ColorScheme } from "@core/framework/types";
import type { CameraSnapshot } from "../geometry";
import type { EffectiveBaseline } from "../streamingConfig";
import { traverseOctree } from "../traversal";
import { computeBudgetPlan } from "../budget/computeBudgetPlan";
import { truncateToPlan } from "../budget/truncateToPlan";
import { shouldRetryAfterTruncation } from "../budget/shouldRetryAfterTruncation";
import { computeVisibleCachedNodes } from "../render/computeVisibleCachedNodes";
import { updateTileAncestorContentLinks } from "../traversal/lodSeparation";
import { getOctreeParentKey } from "../octree/octreeKey";
import type { NodeMetadataRegistry } from "../metadata/NodeMetadataRegistry";
import type { NodeLoader } from "../loading/NodeLoader";
import type { TileEvictionManager } from "../eviction/TileEvictionManager";
import type { RenderBufferPool } from "../render/RenderBufferPool";
import type { TraversalOrchestrator } from "../traversal/TraversalOrchestrator";
import type { HierarchyLoadTracker } from "../octree/HierarchyLoadTracker";
import type { CycleInput } from "./CycleRunner";
import type { Hierarchy } from "copc";

/** Simple 32-bit string hash for integrity check. */
function hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h;
}

/** O(1) integrity hash: length XOR first-key-hash XOR last-key-hash. */
function computeSetIntegrityHash(keys: string[]): number {
    if (keys.length === 0) return 0;
    return (
        (keys.length ^
            hashString(keys[0]!) ^
            hashString(keys[keys.length - 1]!)) >>>
        0
    );
}

/** Immutable services injected by CopcStreamingLoader. */
export interface CycleServices {
    nodeCache: Map<string, CachedNode>;
    nodeLoader: NodeLoader;
    eviction: TileEvictionManager<CachedNode>;
    metadata: NodeMetadataRegistry;
    hierarchyTracker: HierarchyLoadTracker;
    traversal: TraversalOrchestrator;
    renderPool: RenderBufferPool;
    coordinateOrigin: [number, number, number];
    bounds: {
        minX: number;
        minY: number;
        minZ: number;
        maxX: number;
        maxY: number;
        maxZ: number;
    };
    rootHierarchyPage: Hierarchy.Page;
    geometricErrorByDepth: (depth: number) => number;
    evictionThresholdRatio: number;
}

/** Mutable state shared between CopcStreamingLoader and CycleExecutor. */
export interface CycleState {
    frameCounter: number;
    totalLoadedPoints: number;
    totalLoadedNodes: number;
    lastCameraSnapshot: CameraSnapshot | null;
    lastVisibleSetHash: number;
    depthDistribution: Map<number, number>;
    maxDepthInHierarchy: number;
    effectiveBaseline: EffectiveBaseline;
    activeScheme: ColorScheme;
    onPointsLoaded: ((data: PointCloudData) => void) | null;
}

/**
 * Encapsulates a single streaming cycle:
 * prepare → traverse → cancel stale → metadata update → plan & evict → load → render.
 *
 * Operates on shared `CycleState` (mutable) and injected `CycleServices` (immutable).
 */
export class CycleExecutor {
    constructor(
        private readonly _services: CycleServices,
        private readonly _state: CycleState,
    ) {}

    // -- Main cycle entry point

    async run(
        input: CycleInput,
        requestRetry: (input: CycleInput) => void,
    ): Promise<void> {
        const { cameraSnapshot, viewportBounds } = input;

        this._state.lastCameraSnapshot = { ...cameraSnapshot };

        await this._prepareCycle();

        const traversalResult = await this._services.traversal.run({
            camera: this._state.lastCameraSnapshot!,
            viewportBounds,
            maxScreenErrorPx: this._state.effectiveBaseline.maxScreenErrorPx,
            geometricErrorByDepth: this._services.geometricErrorByDepth,
        });

        const candidateKeys = new Set(
            traversalResult.candidates.map((c) => c.key),
        );
        this._services.nodeLoader.cancelStale(candidateKeys, (node) => {
            this._state.totalLoadedPoints -= node.pointCount;
        });
        this._updateCandidateMetadata(traversalResult.candidates);

        const { finalToLoad, freedPoints, plan } =
            this._planAndEvict(traversalResult);

        const enqueuedCount = this._enqueueNodes(finalToLoad, (key) => {
            const c = traversalResult.candidates.find(
                (cand) => cand.key === key,
            );
            return c ? -c.priority : -Infinity;
        });
        if (enqueuedCount > 0) {
            await this._services.nodeLoader.drain();
        }

        this._updateRenderAndNotify();

        if (
            shouldRetryAfterTruncation(
                finalToLoad.length,
                plan.toLoad.length,
                freedPoints,
            )
        ) {
            requestRetry(input);
        }
    }

    // -- Render queries

    getLoadedPointCloudData(): PointCloudData {
        const visibleKeys = this._computeCurrentVisibleKeys();
        if (!visibleKeys) throw new Error("No point data loaded");
        const data = this._buildRenderBuffer(visibleKeys);
        if (!data) throw new Error("No point data loaded");
        return data;
    }

    // -- Private: cycle steps

    private async _prepareCycle(): Promise<void> {
        await this._services.hierarchyTracker.ensureLoaded(
            "0-0-0-0",
            this._services.rootHierarchyPage,
        );
    }

    private _updateCandidateMetadata(
        candidates: ReturnType<typeof traverseOctree>["candidates"],
    ): void {
        this._state.frameCounter++;

        for (const candidate of candidates) {
            const node = this._services.nodeCache.get(candidate.key);
            if (!node) continue;

            const parentKey = getOctreeParentKey(candidate.key);
            if (parentKey) {
                node.parent = this._services.nodeCache.get(parentKey) ?? null;
            }
            updateTileAncestorContentLinks(
                node,
                this._state.frameCounter,
                this._services.metadata,
            );

            node.lastSeenAt = this._state.frameCounter;
            node.priority = -candidate.priority;
            node.distanceToCamera = candidate.distanceToCamera;

            this._services.eviction.touch(node);
        }
    }

    private _planAndEvict(traversalResult: ReturnType<typeof traverseOctree>): {
        finalToLoad: string[];
        freedPoints: number;
        plan: BudgetPlan;
    } {
        const plan = computeBudgetPlan(
            traversalResult.candidates,
            this._services.nodeCache,
            this._state.effectiveBaseline.pointBudget,
            traversalResult.fallbacks,
        );

        const evictionThreshold = Math.floor(
            this._state.effectiveBaseline.pointBudget *
                this._services.evictionThresholdRatio,
        );

        const toLoadSet = new Set(plan.toLoad);

        const { freedPoints, evictedCount } =
            this._services.eviction.evictToBudget({
                totalPoints: this._state.totalLoadedPoints,
                targetBudget: evictionThreshold,
                currentFrame: this._state.frameCounter,
                nodeCache: this._services.nodeCache,
                toLoadSet,
                errorKeys: this._services.nodeLoader.errorKeys,
            });
        this._state.totalLoadedPoints -= freedPoints;
        this._state.totalLoadedNodes -= evictedCount;

        const effectiveDeficit = Math.max(0, plan.deficit - freedPoints);
        let finalToLoad = plan.toLoad;
        if (effectiveDeficit > 0) {
            const remainingBudget =
                this._state.effectiveBaseline.pointBudget -
                this._state.totalLoadedPoints;
            finalToLoad = truncateToPlan(
                plan.toLoad,
                this._services.nodeCache,
                remainingBudget,
            );
        }

        return { finalToLoad, freedPoints, plan };
    }

    private _enqueueNodes(
        keys: string[],
        getPriority: (key: string) => number,
    ): number {
        return this._services.nodeLoader.enqueueBatch(keys, getPriority);
    }

    private _buildRenderBuffer(visibleKeys: string[]): PointCloudData | null {
        return this._services.renderPool.build(
            visibleKeys,
            this._services.nodeCache,
            this._state.activeScheme,
            {
                coordinateOrigin: this._services.coordinateOrigin,
                bounds: this._services.bounds,
            },
        );
    }

    private _computeCurrentVisibleKeys(): string[] | null {
        if (!this._state.lastCameraSnapshot) return null;
        return computeVisibleCachedNodes(
            this._services.nodeCache,
            this._state.lastCameraSnapshot,
            {
                geometricErrorByDepth: this._services.geometricErrorByDepth,
                maxScreenErrorPx:
                    this._state.effectiveBaseline.maxScreenErrorPx,
                registry: this._services.metadata,
            },
        );
    }

    private _updateRenderAndNotify(): void {
        if (!this._state.onPointsLoaded) return;
        const visibleKeys = this._computeCurrentVisibleKeys();
        if (!visibleKeys) return;

        const hash = computeSetIntegrityHash(visibleKeys);
        if (hash === this._state.lastVisibleSetHash) return;
        this._state.lastVisibleSetHash = hash;

        this._markVisibleTilesRendered(visibleKeys);

        const data = this._buildRenderBuffer(visibleKeys);
        if (!data) return;

        this._state.onPointsLoaded(data);
    }

    private _markVisibleTilesRendered(visibleKeys: string[]): void {
        this._services.eviction.markStartOfRenderFrame();
        for (const key of visibleKeys) {
            const node = this._services.nodeCache.get(key);
            if (node?.state === "loaded") {
                this._services.eviction.markTileRendered(node);
            }
        }
    }
}
