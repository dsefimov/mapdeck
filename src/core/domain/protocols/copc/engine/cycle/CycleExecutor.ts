import type { CachedNode } from "../../types";
import type { ColorScheme, PointCloudFrame } from "@core/contracts";
import type { BBox3D } from "@core/lib/geo";
import type { CameraSnapshot } from "../geometry";
import type { EffectiveBaseline } from "../streamingConfig";
import { traverseOctree } from "../traversal";
import { computeBudgetPlan } from "../budget/computeBudgetPlan";
import { computeVisibleCachedNodes } from "../render/computeVisibleCachedNodes";
import { getOctreeParentKey } from "../octree/octreeKey";
import type { ViewportRect } from "../eviction/distanceToViewport";
import type { NodeLoader } from "../loading";
import type { TileEvictionManager } from "../eviction/TileEvictionManager";
import type { RenderBufferPool } from "../render/RenderBufferPool";
import type { TraversalOrchestrator } from "../traversal/TraversalOrchestrator";
import type { HierarchyLoadTracker } from "../octree/HierarchyLoadTracker";
import { sumPendingDemandPoints } from "./demand";
import { shouldSettleRetry } from "./shouldSettleRetry";
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
    eviction: TileEvictionManager;
    hierarchyTracker: HierarchyLoadTracker;
    traversal: TraversalOrchestrator;
    renderPool: RenderBufferPool;
    coordinateOrigin: [number, number, number];
    bounds: BBox3D;
    rootHierarchyPage: Hierarchy.Page;
    geometricErrorByDepth: (depth: number) => number;
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
    onPointsLoaded: ((frame: PointCloudFrame) => void) | null;
}

/**
 * Encapsulates a single streaming cycle:
 * prepare → traverse → cancel stale → candidate update → evict & plan → load → render.
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
        supersedeSignal?: AbortSignal,
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

        // Evict before planning: the plan must see a budget already
        // reserved for the view's unserved demand, or an over-spent
        // residency starves it to a coarse fallback.
        const { finalToLoad, evictedCount, targetPoints } =
            this._evictThenPlan(traversalResult, viewportBounds);

        const priorityByKey = new Map(
            traversalResult.candidates.map((c) => [c.key, c.priority]),
        );
        const enqueuedCount = this._enqueueNodes(finalToLoad, (key) =>
            priorityByKey.get(key) ?? Infinity,
        );
        if (enqueuedCount > 0) {
            // Progressive rendering: push a frame every so often while nodes
            // stream in instead of waiting for the whole batch. The drain
            // ends early when a newer input supersedes this cycle — the
            // replacement cycle re-plans and prunes the leftovers itself.
            let lastProgressBuild = 0;
            await this._services.nodeLoader.drain(
                () => {
                    const now = Date.now();
                    if (now - lastProgressBuild < PROGRESS_RENDER_INTERVAL_MS) {
                        return;
                    }
                    lastProgressBuild = now;
                    this._updateRenderAndNotify();
                },
                supersedeSignal,
            );
        }

        // The drain is over — fold the streamed nodes into a fresh base so
        // the next cycle starts from a committed snapshot.
        this._updateRenderAndNotify(false, true);

        // A superseded cycle must not queue its own retry: the superseding
        // input already carries a newer camera.
        if (supersedeSignal?.aborted) return;

        // Lazy discovery: pages fetched for expansions mean deeper nodes may
        // now be reachable — one more cycle with the same camera converges
        // the tree without waiting for user movement.
        if (traversalResult.expandedPages > 0) {
            requestRetry(input);
            return;
        }

        // Settle: the drain can push residency past the target computed
        // before it ran; while demand is unserved, one more cycle evicts
        // what the view no longer holds and reinvests the budget. The
        // progress guard keeps an unproductive chain from spinning.
        if (
            shouldSettleRetry({
                enqueuedCount,
                evictedCount,
                pendingDemandPoints: sumPendingDemandPoints(
                    traversalResult.candidates,
                    this._services.nodeCache,
                ),
                totalPoints: this._state.totalLoadedPoints,
                targetPoints,
            })
        ) {
            requestRetry(input);
        }
    }

    /**
     * Rebuild and push the render buffer for the current visible set.
     * Render-only: no traversal, no loading, no eviction. Pass `force`
     * when data changed outside the loader's accounting (e.g. lazily
     * derived color buffers finished arriving) — a forced refresh also
     * commits, because those changes rewrite the base's baked bytes.
     */
    refreshRender(force = false): void {
        this._updateRenderAndNotify(force, force);
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
        // One page, not the whole tree: the root page carries the first
        // levels, deeper splits expand lazily per traversal cycle. A failed
        // root page is fatal — nothing downstream can work without it.
        await this._services.hierarchyTracker.ensureLoaded(
            "0-0-0-0",
            this._services.rootHierarchyPage,
            { fatal: true },
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
        }
    }

    /**
     * Evict, then plan. The eviction target reserves the budget the view's
     * unserved demand still wants: `max(0, budget − demand)`. Invisible
     * tiles keep memory only past that reservation, and the victim order
     * sheds the most distant ones first (see TileEvictionManager).
     */
    private _evictThenPlan(
        traversalResult: ReturnType<typeof traverseOctree>,
        viewportBounds: ViewportRect,
    ): {
        finalToLoad: string[];
        evictedCount: number;
        targetPoints: number;
    } {
        const budget = this._state.effectiveBaseline.pointBudget;
        const demand = Math.min(
            sumPendingDemandPoints(
                traversalResult.candidates,
                this._services.nodeCache,
            ),
            budget,
        );
        const targetPoints = Math.max(0, budget - demand);

        const { freedPoints, evictedCount } =
            this._services.eviction.evictToBudget({
                totalPoints: this._state.totalLoadedPoints,
                targetPoints,
                currentFrame: this._state.frameCounter,
                viewportBounds,
                nodeCache: this._services.nodeCache,
                errorKeys: this._services.nodeLoader.errorKeys,
            });
        this._state.totalLoadedPoints -= freedPoints;
        this._state.totalLoadedNodes -= evictedCount;

        const plan = computeBudgetPlan(
            traversalResult.candidates,
            this._services.nodeCache,
            budget,
            traversalResult.fallbacks,
        );

        return { finalToLoad: plan.toLoad, evictedCount, targetPoints };
    }

    private _enqueueNodes(
        keys: string[],
        getPriority: (key: string) => number,
    ): number {
        return this._services.nodeLoader.enqueueBatch(keys, getPriority);
    }

    private _buildRenderBuffer(
        visibleKeys: string[],
        commit: boolean,
    ): PointCloudFrame | null {
        const meta = {
            coordinateOrigin: this._services.coordinateOrigin,
            bounds: this._services.bounds,
        };
        return commit
            ? this._services.renderPool.commit(
                  visibleKeys,
                  this._services.nodeCache,
                  this._state.activeScheme,
                  meta,
              )
            : this._services.renderPool.build(
                  visibleKeys,
                  this._services.nodeCache,
                  this._state.activeScheme,
                  meta,
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

    private _updateRenderAndNotify(force = false, commit = false): void {
        if (!this._state.onPointsLoaded) return;
        const visibleKeys = this._computeCurrentVisibleKeys();
        if (!visibleKeys) return;

        const loadStamp = this._services.nodeLoader.loadStamp;
        const dataUnchanged =
            sameVisibleSet(this._state.lastVisibleKeys, visibleKeys) &&
            loadStamp === this._renderedAtLoadStamp;
        // A commit must not be skipped by the unchanged guard: folding the
        // incoming part into the base matters even when no new data arrived.
        if (!force && !commit && dataUnchanged) return;

        this._state.lastVisibleKeys = visibleKeys;
        this._renderedAtLoadStamp = loadStamp;

        const frame = this._buildRenderBuffer(visibleKeys, commit);
        if (!frame) return;

        this._state.onPointsLoaded(frame);
    }
}
