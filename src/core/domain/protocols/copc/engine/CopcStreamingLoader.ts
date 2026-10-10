/* global navigator, queueMicrotask */
import { Copc, Hierarchy, Getter } from "copc";
import type { Copc as CopcType, View } from "copc";
import type { LazPerf } from "laz-perf";
import RBush from "rbush";

import { ColorScheme, type PointCloudData } from "@core/contracts";
import { Bbox, type BBox3D } from "@core/lib/geo";
import { logger } from "@core/lib/logger";
import type {
    NodeKey,
    CachedNode,
    StreamingLoaderOptions,
    StreamingSource,
} from "../types";
import { WorkerPool } from "./workers/WorkerPool";
import {
    computeGeometricError,
    computeRootSpacingMeters,
    transformNodeBoundsToWgs84,
} from "./geometry";
import { RenderBufferPool } from "./render/RenderBufferPool";
import { NodeDataExtractor } from "./extraction/NodeDataExtractor";
import { NodeLoader } from "./loading";
import { TraversalOrchestrator } from "./traversal/TraversalOrchestrator";
import type { PriorityState } from "./priority";
import {
    DEFAULT_POINT_BUDGET,
    DEFAULT_MAX_SCREEN_ERROR_PX,
    DEFAULT_RANGE_REQUEST_TIMEOUT_MS,
    DEFAULT_WORKER_REQUEST_TIMEOUT_MS,
} from "./streamingConfig";
import type { EffectiveBaseline } from "./streamingConfig";
import { HierarchyLoadTracker } from "./octree/HierarchyLoadTracker";
import type { OnNodesDiscovered } from "./octree/HierarchyLoadTracker";
import { octreeCellBounds } from "./octree/cellBounds";
import type { CameraSnapshot } from "./geometry";

import { TileEvictionManager } from "./eviction/TileEvictionManager";
import {
    type NodeBBoxEntry,
    toNodeBBoxEntry,
} from "./traversal/traverseOctree";
import { clearRetryState, scheduleRetry } from "./utils";
import { clearNodeBuffers } from "./eviction/clearTileData";
import { parseOctreeKey } from "./octree/octreeKey";

import { initCopc } from "./initialization/initCopc";
import type { CopcInit } from "./initialization/initCopc";
import { createBoundedGetter } from "./initialization/boundedGetter";
import { CycleRunner } from "./cycle/CycleRunner";
import { CycleExecutor } from "./cycle/CycleExecutor";
import type { CycleState } from "./cycle/CycleExecutor";
import { SchemeColorizer } from "./recolor/SchemeColorizer";
import { toBoundsTuple } from "./extraction/rawExtraction";
import { recordNodeDepth } from "./cycle/depthDistribution";
import type { CycleInput } from "./cycle/CycleRunner";

/**
 * COPC point-cloud streaming engine: SSE-driven octree traversal under a
 * point budget, with tile eviction and error backoff. Source
 * coordinates are WGS84 (EPSG:4326).
 */
export class CopcStreamingLoader {
    private _originalSource: StreamingSource;
    private _source: string | Getter = "";
    private _copc: CopcType | null = null;
    private _lazPerf: LazPerf | null = null;
    private _lazPerfPromise: Promise<LazPerf>;
    private _options: StreamingLoaderOptions;

    private _hierarchyTracker: HierarchyLoadTracker | null = null;
    private _rootHierarchyPage: Hierarchy.Page | null = null;
    private _nodeCache = new Map<string, CachedNode>();

    private _renderPool = new RenderBufferPool();

    private _coordinateOrigin: [number, number, number] = [0, 0, 0];
    private _bounds: BBox3D = Bbox.fromCorners({
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 0,
        maxY: 0,
        maxZ: 0,
    });

    private _isInitialized = false;
    private _destroyed = false;

    private _cycleRunner: CycleRunner;
    private _cycleExecutor: CycleExecutor | null = null;
    private _cycleState: CycleState;
    private _nodeLoader: NodeLoader;
    private _traversal: TraversalOrchestrator | null = null;

    private _hasColor = false;
    private _totalPointsInFile = 0;
    private _originalOctreeCube: [
        number,
        number,
        number,
        number,
        number,
        number,
    ] = [0, 0, 0, 0, 0, 0];
    private _spacing = 0;

    private _spatialIndex = new RBush<NodeBBoxEntry>();

    private _transformer:
        | ((coord: [number, number]) => [number, number])
        | null = null;
    private _needsTransform: boolean = false;
    private _workerPool: WorkerPool | null = null;
    private _dataExtractor: NodeDataExtractor | null = null;

    private _geometricErrorByDepth: ((depth: number) => number) | null = null;

    /** Per-node priority state side-car, filled by traversal metrics. */
    private _priorityStates = new WeakMap<CachedNode, PriorityState>();

    private _eviction: TileEvictionManager<CachedNode>;

    /** Derives lazily-requested scheme buffers for loaded nodes. */
    private _colorizer: SchemeColorizer | null = null;
    /** Bumps on every switchScheme — stale recolor completions must not re-render. */
    private _schemeGeneration = 0;
    private _recolorRenderQueued = false;

    constructor(
        source: StreamingSource,
        options: StreamingLoaderOptions,
        lazPerfPromise: Promise<LazPerf>,
    ) {
        this._originalSource = source;
        this._options = options;
        this._lazPerfPromise = lazPerfPromise;

        this._cycleState = {
            frameCounter: 0,
            totalLoadedPoints: 0,
            totalLoadedNodes: 0,
            lastCameraSnapshot: null,
            lastVisibleKeys: null,
            depthDistribution: new Map(),
            maxDepthInHierarchy: 0,
            effectiveBaseline: {
                maxScreenErrorPx: DEFAULT_MAX_SCREEN_ERROR_PX,
                pointBudget: DEFAULT_POINT_BUDGET,
            },
            activeScheme: ColorScheme.RGB,
            onPointsLoaded: null,
        };

        this._eviction = new TileEvictionManager<CachedNode>();
        this._cycleRunner = new CycleRunner((input) => this._runCycle(input));
        this._nodeLoader = new NodeLoader(
            this._nodeCache,
            options.maxConcurrentRequests,
            (node, signal) => this._loadNode(node, signal),
        );
    }

    private static getWorkerPoolSize(): number {
        const cpuCount =
            typeof navigator !== "undefined"
                ? (navigator.hardwareConcurrency ?? 4)
                : 4;
        return Math.max(1, Math.min(4, Math.floor(cpuCount / 2)));
    }

    async initialize(): Promise<{
        bounds: BBox3D;
        totalPoints: number;
        spacing: number;
        spacingMeters: number;
    }> {
        this._lazPerf = await this._lazPerfPromise;

        const init = await initCopc(this._originalSource);
        this._applyInitResult(init);

        // initCopc throws rather than returning a null copc, so everything
        // below runs with a concrete header.
        const { header } = init.copc;
        const rootSpacing = computeRootSpacingMeters({
            minX: header.min[0],
            minY: header.min[1],
            minZ: header.min[2],
            maxX: header.max[0],
            maxY: header.max[1],
            maxZ: header.max[2],
            spacing: this._spacing,
            totalPoints: this._totalPointsInFile,
            needsTransform: this._needsTransform,
        });
        const geometricErrorByDepth = (d: number) =>
            computeGeometricError(rootSpacing, d);
        this._geometricErrorByDepth = geometricErrorByDepth;

        this._buildDataRuntime(init.copc);
        this._buildTraversalRuntime(
            geometricErrorByDepth,
            init.meta.rootHierarchyPage,
        );

        this._isInitialized = true;

        return {
            bounds: this._bounds,
            totalPoints: this._totalPointsInFile,
            spacing: this._spacing,
            spacingMeters: init.meta.spacingMeters,
        };
    }

    /** Apply the init pipeline's outcome onto the engine's fields. */
    private _applyInitResult(init: CopcInit): void {
        this._copc = init.copc;
        this._source = init.resolvedSource;
        this._bounds = init.meta.bounds;
        this._coordinateOrigin = init.meta.coordinateOrigin;
        this._totalPointsInFile = init.meta.totalPoints;
        this._spacing = init.meta.spacing;
        this._hasColor = init.meta.hasColor;
        this._originalOctreeCube = init.meta.octreeCube;
        this._rootHierarchyPage = init.meta.rootHierarchyPage;
        this._transformer = init.transformer;
        this._needsTransform = init.needsTransform;
    }

    /** Worker pool and the node-data services running over it. */
    private _buildDataRuntime(copc: CopcType): void {
        this._workerPool = new WorkerPool(
            () =>
                new Worker(
                    new URL(
                        "./workers/pointProcessing.worker.ts",
                        import.meta.url,
                    ),
                    { type: "module" },
                ),
            CopcStreamingLoader.getWorkerPoolSize(),
            DEFAULT_WORKER_REQUEST_TIMEOUT_MS,
        );

        this._dataExtractor = new NodeDataExtractor(this._workerPool, {
            hasColor: this._hasColor,
            needsTransform: this._needsTransform,
            wkt: copc.wkt ?? null,
            coordinateOrigin: this._coordinateOrigin,
            bounds: this._bounds,
        });

        this._colorizer = new SchemeColorizer(this._workerPool, () =>
            toBoundsTuple(this._bounds),
        );
    }

    /** Hierarchy tracker, traversal orchestrator and cycle executor wiring. */
    private _buildTraversalRuntime(
        geometricErrorByDepth: (depth: number) => number,
        rootHierarchyPage: Hierarchy.Page,
    ): void {
        // _processSubtreeNodes only receives fresh nodes from the tracker's
        // per-node dedup layer, preventing RBush duplicates on incremental inserts.
        const onNodesDiscovered: OnNodesDiscovered = (subtree) => {
            this._processSubtreeNodes(subtree);
        };
        this._hierarchyTracker = new HierarchyLoadTracker(
            this._source,
            onNodesDiscovered,
        );

        this._traversal = new TraversalOrchestrator({
            nodeCache: this._nodeCache,
            spatialIndex: this._spatialIndex,
            hierarchyTracker: this._hierarchyTracker,
            priorityStateMap: this._priorityStates,
            maxOctreeDepth: this._options.maxOctreeDepth,
        });

        this._cycleExecutor = new CycleExecutor(
            {
                nodeCache: this._nodeCache,
                nodeLoader: this._nodeLoader,
                eviction: this._eviction,
                hierarchyTracker: this._hierarchyTracker,
                traversal: this._traversal,
                renderPool: this._renderPool,
                coordinateOrigin: this._coordinateOrigin,
                bounds: this._bounds,
                rootHierarchyPage,
                geometricErrorByDepth,
                evictionThresholdRatio:
                    this._options.evictionThresholdRatio ?? 0.8,
            },
            this._cycleState,
        );
    }

    private _processSubtreeNodes(subtree: Hierarchy.Subtree): void {
        for (const [key, entry] of Object.entries(subtree.nodes)) {
            if (!entry) continue;

            const keyArray = parseKeyOrWarn(key);
            if (!keyArray) continue;

            this._registerNode(key, keyArray, entry as Hierarchy.Node);
        }
    }

    /** Cache a discovered node, index it spatially and record its depth. */
    private _registerNode(
        key: string,
        keyArray: NodeKey,
        entry: Hierarchy.Node,
    ): void {
        const nodeBounds = this._calculateNodeBounds(keyArray);
        const cachedNode = buildCachedNode(key, keyArray, entry, nodeBounds);

        this._nodeCache.set(key, cachedNode);
        // Incremental RBush insert: new nodes are added once (on hierarchy
        // decode), never per camera movement.
        this._spatialIndex.insert(
            toNodeBBoxEntry(key, nodeBounds.boundsWgs84),
        );

        // Merged on discovery, no second pass over the cache needed.
        this._cycleState.maxDepthInHierarchy = recordNodeDepth(
            this._cycleState.depthDistribution,
            this._cycleState.maxDepthInHierarchy,
            keyArray[0],
        );
    }

    private _calculateNodeBounds(keyArray: NodeKey): {
        bounds: BBox3D;
        boundsWgs84: BBox3D;
    } {
        const bounds = octreeCellBounds(this._originalOctreeCube, keyArray);
        const transformer = this._needsTransform ? this._transformer : null;
        const boundsWgs84 = transformer
            ? transformNodeBoundsToWgs84(transformer, bounds)
            : bounds;
        return { bounds, boundsWgs84 };
    }

    private async _loadNode(
        node: CachedNode,
        signal: AbortSignal,
    ): Promise<void> {
        this._cycleState.totalLoadedPoints += node.pointCount;

        node.state = "loading";

        try {
            // Loads are only requested through the cycle executor, which
            // exists exclusively after initialize() — the guard is narrowing.
            const copc = this._copc;
            const lazPerf = this._lazPerf;
            if (!copc || !lazPerf) return;

            const hierarchyNode: Hierarchy.Node = {
                pointCount: node.pointCount,
                pointDataOffset: node.pointDataOffset,
                pointDataLength: node.pointDataLength,
            };

            const view = await Copc.loadPointDataView(
                createBoundedGetter(
                    this._source,
                    signal,
                    DEFAULT_RANGE_REQUEST_TIMEOUT_MS,
                ),
                copc,
                hierarchyNode,
                { lazPerf },
            );

            if (node.state !== "loading") return;

            await this._extractAndProcessNode(view, node);

            // The worker phase is unreachable by the abort signal: a cancel
            // during extraction has already reset the state and refunded
            // this node's budget — the result must not resurrect the node
            // (the settle check is the last line of defense).
            if (node.state !== "loading") {
                clearNodeBuffers(node);
                return;
            }

            node.state = "loaded";
            clearRetryState(node);
            this._cycleState.totalLoadedNodes++;
            this._eviction.touch(node);
            this._recolorToActiveScheme(node);
        } catch (error) {
            this._handleLoadError(node, error);
        } finally {
            this._nodeLoader.onLoadSettled();
        }
    }

    /**
     * Process a load error: release budget, classify error type,
     * schedule retry with exponential backoff.
     */
    private _handleLoadError(node: CachedNode, error: unknown): void {
        if (node.state === "loading") {
            this._cycleState.totalLoadedPoints -= node.pointCount;
            clearNodeBuffers(node);
        }

        const isAbort =
            error instanceof DOMException && error.name === "AbortError";

        if (isAbort) {
            node.state = "pending";
        } else {
            node.state = "error";
            this._nodeLoader.addErrorNode(node.key);
            scheduleRetry(
                node,
                error instanceof Error ? error.message : String(error),
                Date.now(),
            );
        }
    }

    private async _extractAndProcessNode(
        view: View,
        node: CachedNode,
    ): Promise<void> {
        // Created in initialize(); extraction is only reachable post-init —
        // the guard is narrowing.
        const extractor = this._dataExtractor;
        if (!extractor) return;
        await extractor.extract(view, node);
    }

    /**
     * Streaming nodes converge to the active scheme as they arrive —
     * a no-op under the default RGB scheme (computed eagerly in the worker).
     *
     * A failed recolor leaves the node on its current colors until the next
     * scheme flip retries it; the rejection (a disposed pool on teardown is
     * the usual one) must not surface as an unhandled global error.
     */
    private _recolorToActiveScheme(node: CachedNode): void {
        const { activeScheme } = this._cycleState;
        if (activeScheme === ColorScheme.RGB || !this._colorizer) return;
        void this._colorizer
            .ensure(activeScheme, [node])
            .then(() => {
                this._queueRecolorRender();
            })
            .catch(() => {});
    }

    /**
     * Coalesces recolor completions into one forced re-render per microtask
     * burst: the loader's load-stamp guard cannot see lazily derived buffers,
     * so their arrival must push the frame explicitly.
     */
    private _queueRecolorRender(): void {
        if (this._recolorRenderQueued) return;
        this._recolorRenderQueued = true;
        queueMicrotask(() => {
            this._recolorRenderQueued = false;
            this._cycleExecutor?.refreshRender(true);
        });
    }

    /**
     * Request a new load cycle. Called by selectNodesSSE (which is called by
     * the adapter on viewport change).
     *
     * Delegates FSM management to CycleRunner.
     */
    private _requestCycle(input: CycleInput): void {
        if (this._destroyed) return;
        this._cycleRunner.request(input);
    }

    /**
     * A single load cycle: delegates to CycleExecutor.
     */
    private async _runCycle(input: CycleInput): Promise<void> {
        if (
            !this._isInitialized ||
            !this._rootHierarchyPage ||
            !this._cycleExecutor
        ) {
            throw new Error("Loader not initialized");
        }
        if (!this._geometricErrorByDepth) return;
        if (!this._hierarchyTracker) return;

        await this._cycleExecutor.run(input, (retryInput) =>
            this._requestCycle(retryInput),
        );
    }

    /**
     * SSE-based node selection. Called by adapter with frustum footprint + camera position.
     */
    selectNodesSSE(
        camera: CameraSnapshot,
        viewportBounds: [number, number, number, number],
    ): void {
        this._requestCycle({ cameraSnapshot: camera, viewportBounds });
    }

    setEffectiveBaseline(baseline: EffectiveBaseline): void {
        this._cycleState.effectiveBaseline = baseline;
    }

    setOnPointsLoaded(callback: (data: PointCloudData) => void): void {
        this._cycleState.onPointsLoaded = callback;
    }

    /**
     * Flips the active scheme and derives missing buffers on demand: visible
     * nodes recolor first, then a single frame is pushed; the rest of the
     * cache fills in the background. Nodes already holding the target buffer
     * re-render immediately.
     */
    switchScheme(scheme: ColorScheme): void {
        this._cycleState.activeScheme = scheme;
        this._cycleState.lastVisibleKeys = null;

        const colorizer = this._colorizer;
        const executor = this._cycleExecutor;
        if (!colorizer || !executor) return;

        const generation = ++this._schemeGeneration;
        const visibleNodes = executor.currentVisibleLoadedNodes();

        void colorizer
            .ensure(scheme, visibleNodes)
            .then(() => {
                if (generation === this._schemeGeneration) {
                    executor.refreshRender(true);
                }
            })
            .catch(() => {});

        const visibleKeys = new Set(visibleNodes.map((n) => n.key));
        const restOfCache: CachedNode[] = [];
        for (const node of this._nodeCache.values()) {
            if (node.state === "loaded" && !visibleKeys.has(node.key)) {
                restOfCache.push(node);
            }
        }
        this._recolorRest(scheme, restOfCache);
    }

    /**
     * Background recolor of the non-visible cache in small chained chunks:
     * posting the whole cache at once would fill the worker queue and starve
     * node loads behind one scheme flip's worth of jobs.
     */
    private _recolorRest(scheme: ColorScheme, nodes: CachedNode[]): void {
        const CHUNK = 16;
        const pump = (from: number): void => {
            if (this._destroyed || from >= nodes.length) return;
            void this._colorizer
                ?.ensure(scheme, nodes.slice(from, from + CHUNK))
                .catch(() => {})
                .then(() => pump(from + CHUNK));
        };
        pump(0);
    }

    /** Save the latest camera snapshot for visible-set computation. */
    setCameraSnapshot(snapshot: CameraSnapshot): void {
        this._cycleState.lastCameraSnapshot = snapshot;
    }

    destroy(): void {
        this._destroyed = true;
        // Silence the render callback first: a cycle awaiting drain resolves
        // during cancelAll and must not push a frame over cleared caches.
        this._cycleState.onPointsLoaded = null;
        this._nodeLoader.cancelAll();
        if (this._workerPool) {
            this._workerPool.dispose();
            this._workerPool = null;
        }
        this._nodeCache.clear();
        this._hierarchyTracker?.clear();
    }
}

/**
 * Parse an octree key, warning and skipping on malformed input: one bad key
 * must not abort the whole subtree's discovery — the rest of the hierarchy
 * is still usable.
 */
function parseKeyOrWarn(key: string): NodeKey | null {
    try {
        return parseOctreeKey(key);
    } catch {
        logger.warn(`Skipping malformed octree key "${key}"`);
        return null;
    }
}

/** Build a pending cache entry for a freshly discovered hierarchy node. */
function buildCachedNode(
    key: string,
    keyArray: NodeKey,
    entry: Hierarchy.Node,
    nodeBounds: { bounds: BBox3D; boundsWgs84: BBox3D },
): CachedNode {
    return {
        key,
        keyArray,
        state: "pending",
        pointCount: entry.pointCount,
        pointDataOffset: entry.pointDataOffset,
        pointDataLength: entry.pointDataLength,
        bounds: nodeBounds.bounds,
        boundsWgs84: nodeBounds.boundsWgs84,
    };
}
