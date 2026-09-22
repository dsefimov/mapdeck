import type { CachedNode, BudgetPlan } from "../../types";
import type { ColorScheme, PointCloudData } from "@core/contracts";
import type { BBox3D } from "@core/lib/geo";
import type { CameraSnapshot } from "../geometry";
import type { EffectiveBaseline } from "../streamingConfig";
import { traverseOctree } from "../traversal";
import { computeBudgetPlan } from "../budget/computeBudgetPlan";
import { truncateToPlan } from "../budget/truncateToPlan";
import { shouldRetryAfterTruncation } from "../budget/shouldRetryAfterTruncation";
import { computeVisibleCachedNodes } from "../render/computeVisibleCachedNodes";
import { getOctreeParentKey } from "../octree/octreeKey";
import type { NodeLoader } from "../loading";
import type { TileEvictionManager } from "../eviction/TileEvictionManager";
import type { RenderBufferPool } from "../render/RenderBufferPool";
import type { TraversalOrchestrator } from "../traversal/TraversalOrchestrator";
import type { HierarchyLoadTracker } from "../octree/HierarchyLoadTracker";
import type { CycleInput } from "./CycleRunner";
import type { Hierarchy } from "copc";

/**
 * Exact visible-set comparison. Order is deterministic: applySSEFilter
 * sorts keys lexicographically, so equal sets always yield equal arrays.
 */
function sameVisibleSet(prev: string[] | null, next: string[]): boolean {
    if (prev === null) return false;
    if (prev.length !== next.length) return false;
    for (let i = 0; i < prev.length; i++) {
        if (prev[i] !== next[i]) return false;
    }
    return true;
}

/** Minimal gap between progressive render pushes while a cycle is loading. */
const PROGRESS_RENDER_INTERVAL_MS = 120;

/** Immutable services injected by CopcStreamingLoader. */
export interface CycleServices {
    nodeCache: Map<string, CachedNode>;
    nodeLoader: NodeLoader;
    eviction: TileEvictionManager<CachedNode>;
    hierarchyTracker: HierarchyLoadTracker;
    traversal: TraversalOrchestrator;
    renderPool: RenderBufferPool;
    coordinateOrigin: [number, number, number];
    bounds: BBox3D;
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
    lastVisibleKeys: string[] | null;
    depthDistribution: Map<number, number>;
    maxDepthInHierarchy: number;
    effectiveBaseline: EffectiveBaseline;
    activeScheme: ColorScheme;
    onPointsLoaded: ((data: PointCloudData) => void) | null;
}

/**
 * Encapsulates a single streaming cycle:
 * prepare → traverse → cancel stale → candidate update → plan & evict → load → render.
 *
 * Operates on shared `CycleState` (mutable) and injected `CycleServices` (immutable).
 */
export class CycleExecutor {
    /** Load-stamp captured at the last render push — new data forces a rebuild. */
    private _renderedAtLoadStamp = -1;

    constructor(
        private readonly _services: CycleServices,
        private readonly _state: CycleState,
    ) {}

    async run(
        input: CycleInput,
        requestRetry: (input: CycleInput) => void,
    ): Promise<void> {
        const { cameraSnapshot, viewportBounds } = input;

        const camera = { ...cameraSnapshot };
        this._state.lastCameraSnapshot = camera;

        await this._prepareCycle();

        const traversalResult = await this._services.traversal.run({
            camera,
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

        const priorityByKey = new Map(
            traversalResult.candidates.map((c) => [c.key, c.priority]),
        );
        const enqueuedCount = this._enqueueNodes(finalToLoad, (key) =>
            priorityByKey.get(key) ?? Infinity,
        );
        if (enqueuedCount > 0) {
            // Progressive rendering: push a frame every so often while nodes
            // stream in instead of waiting for the whole batch.
            let lastProgressBuild = 0;
            await this._services.nodeLoader.drain(() => {
                const now = Date.now();
                if (now - lastProgressBuild < PROGRESS_RENDER_INTERVAL_MS) {
                    return;
                }
                lastProgressBuild = now;
                this._updateRenderAndNotify();
            });
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

    /**
     * Rebuild and push the render buffer for the current visible set.
     * Render-only: no traversal, no loading, no eviction. Pass `force`
     * when data changed outside the loader's accounting (e.g. lazily
     * derived color buffers finished arriving).
     */
    refreshRender(force = false): void {
        this._updateRenderAndNotify(force);
    }

    /** Loaded cached nodes in the current visible set — a scheme switch's recolor scope. */
    currentVisibleLoadedNodes(): CachedNode[] {
        const keys = this._computeCurrentVisibleKeys();
        const nodes: CachedNode[] = [];
        if (!keys) return nodes;
        for (const key of keys) {
            const node = this._services.nodeCache.get(key);
            if (node?.state === "loaded") nodes.push(node);
        }
        return nodes;
    }

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

            node.lastSeenAt = this._state.frameCounter;
            node.priority = candidate.priority;
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

        const { freedPoints, evictedCount } =
            this._services.eviction.evictToBudget({
                totalPoints: this._state.totalLoadedPoints,
                targetBudget: evictionThreshold,
                currentFrame: this._state.frameCounter,
                nodeCache: this._services.nodeCache,
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
            },
        );
    }

    private _updateRenderAndNotify(force = false): void {
        if (!this._state.onPointsLoaded) return;
        const visibleKeys = this._computeCurrentVisibleKeys();
        if (!visibleKeys) return;

        const loadStamp = this._services.nodeLoader.loadStamp;
        const dataUnchanged =
            sameVisibleSet(this._state.lastVisibleKeys, visibleKeys) &&
            loadStamp === this._renderedAtLoadStamp;
        if (!force && dataUnchanged) return;

        this._state.lastVisibleKeys = visibleKeys;
        this._renderedAtLoadStamp = loadStamp;

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
