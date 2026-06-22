/* global navigator */
import { Copc, Hierarchy, Getter } from "copc";
import type { Copc as CopcType, View } from "copc";
import type { LazPerf } from "laz-perf";
import RBush from "rbush";

import { ColorScheme } from "@core/framework/types";
import type {
    NodeKey,
    CachedNode,
    StreamingLoaderOptions,
    StreamingSource,
    PointCloudData,
    BBox3D,
} from "@core/framework/types";
import { WorkerPool } from "./workers/WorkerPool";
import {
    computeRootSpacing,
    computeGeometricError,
    metersPerDegreeAt,
} from "./geometry";
import { RenderBufferPool } from "./render/RenderBufferPool";
import { NodeDataExtractor } from "./extraction/NodeDataExtractor";
import { NodeLoader } from "./loading/NodeLoader";
import { TraversalOrchestrator } from "./traversal/TraversalOrchestrator";
import {
    DEFAULT_POINT_BUDGET,
    DEFAULT_MAX_SCREEN_ERROR_PX,
} from "./streamingConfig";
import type { EffectiveBaseline } from "./streamingConfig";
import { HierarchyLoadTracker } from "./octree/HierarchyLoadTracker";
import type { OnNodesDiscovered } from "./octree/HierarchyLoadTracker";
import type { CameraSnapshot } from "./geometry";

import { TileEvictionManager } from "./eviction/TileEvictionManager";
import type { NodeBBoxEntry } from "./traversal/traverseOctree";
import { NodeMetadataRegistry } from "./metadata/NodeMetadataRegistry";
import { computeRetryDelay } from "./utils/computeRetryDelay";
import { clampLatLng } from "./geometry/wgs84";
import { parseOctreeKey } from "./octree/octreeKey";

import { initCopc } from "./initialization/initCopc";
import { CycleRunner } from "./cycle/CycleRunner";
import { CycleExecutor } from "./cycle/CycleExecutor";
import type { CycleState } from "./cycle/CycleExecutor";
import type { CycleInput } from "./cycle/CycleRunner";

/**
 * Simplified COPC streaming loader for EPSG:4326.
 * Assumes all data is already in WGS84 degrees, no coordinate transformations needed.
 */
export class CopcStreamingLoader {
    private _originalSource: StreamingSource;
    private _source: string | Getter = "";
    private _copc: CopcType | null = null;
    private _lazPerf: LazPerf | null = null;
    private _lazPerfPromise: Promise<LazPerf> | null = null;
    private _options: StreamingLoaderOptions;

    private _hierarchyTracker: HierarchyLoadTracker | null = null;
    private _rootHierarchyPage: Hierarchy.Page | null = null;
    private _nodeCache = new Map<string, CachedNode>();

    private _renderPool = new RenderBufferPool();

    private _coordinateOrigin: [number, number, number] = [0, 0, 0];
    private _bounds: BBox3D = {
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 0,
        maxY: 0,
        maxZ: 0,
    };

    private _isInitialized = false;

    private _cycleRunner: CycleRunner;
    private _cycleExecutor: CycleExecutor | null = null;
    private _cycleState!: CycleState;
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

    private _metadata = new NodeMetadataRegistry();

    private _eviction: TileEvictionManager<CachedNode>;

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
            lastVisibleSetHash: 0,
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
            this._metadata,
            options.maxConcurrentRequests,
            (node) => this._loadNode(node),
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
        this._lazPerf = await this._lazPerfPromise!;

        const { copc, resolvedSource, meta, transformer, needsTransform } =
            await initCopc(this._originalSource);

        this._copc = copc;
        this._source = resolvedSource;
        this._bounds = meta.bounds;
        this._coordinateOrigin = meta.coordinateOrigin;
        this._totalPointsInFile = meta.totalPoints;
        this._spacing = meta.spacing;
        this._hasColor = meta.hasColor;
        this._originalOctreeCube = meta.octreeCube;
        this._rootHierarchyPage = meta.rootHierarchyPage;
        this._transformer = transformer;
        this._needsTransform = needsTransform;

        if (this._copc) {
            const header = this._copc.header;
            let rootSpacing = computeRootSpacing({
                minX: header.min[0],
                minY: header.min[1],
                minZ: header.min[2],
                maxX: header.max[0],
                maxY: header.max[1],
                maxZ: header.max[2],
                spacing: this._spacing,
                totalPoints: this._totalPointsInFile,
            });

            // When data is in WGS84 degrees (no CRS transform), convert rootSpacing
            // from degrees to meters so geometricError(depth) produces meter values
            // consistent with distanceToCamera (also in meters).
            if (!this._needsTransform && rootSpacing > 0) {
                const centerLat = (header.min[1] + header.max[1]) / 2;
                rootSpacing *= metersPerDegreeAt(centerLat);
            }
            this._geometricErrorByDepth = (d: number) =>
                computeGeometricError(rootSpacing, d);
        }

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
        );

        this._dataExtractor = new NodeDataExtractor(this._workerPool, {
            hasColor: this._hasColor,
            needsTransform: this._needsTransform,
            wkt: this._copc?.wkt ?? null,
            coordinateOrigin: this._coordinateOrigin,
            bounds: this._bounds,
        });

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
            priorityStateMap: this._metadata.priority,
            maxOctreeDepth: this._options.maxOctreeDepth,
        });

        this._cycleExecutor = new CycleExecutor(
            {
                nodeCache: this._nodeCache,
                nodeLoader: this._nodeLoader,
                eviction: this._eviction,
                metadata: this._metadata,
                hierarchyTracker: this._hierarchyTracker,
                traversal: this._traversal,
                renderPool: this._renderPool,
                coordinateOrigin: this._coordinateOrigin,
                bounds: this._bounds,
                rootHierarchyPage: this._rootHierarchyPage,
                geometricErrorByDepth: this._geometricErrorByDepth!,
                evictionThresholdRatio:
                    this._options.evictionThresholdRatio ?? 0.8,
            },
            this._cycleState,
        );

        this._isInitialized = true;

        return {
            bounds: this._bounds,
            totalPoints: this._totalPointsInFile,
            spacing: this._spacing,
            spacingMeters: meta.spacingMeters,
        };
    }

    private _processSubtreeNodes(subtree: Hierarchy.Subtree): void {
        for (const [key, entry] of Object.entries(subtree.nodes)) {
            if (!entry) continue;

            const keyArray = parseOctreeKey(key);
            const { bounds, boundsWgs84 } = this._calculateNodeBounds(keyArray);

            const cachedNode: CachedNode = {
                key,
                keyArray,
                state: "pending",
                pointCount: (entry as Hierarchy.Node).pointCount,
                pointDataOffset: (entry as Hierarchy.Node).pointDataOffset,
                pointDataLength: (entry as Hierarchy.Node).pointDataLength,
                bounds,
                boundsWgs84,
            };

            this._nodeCache.set(key, cachedNode);
            // Incremental RBush insert — replaces the old per-traversal rebuild.
            // New nodes are added once (on hierarchy decode), never per camera movement.
            this._spatialIndex.insert({
                minX: boundsWgs84.minX,
                minY: boundsWgs84.minY,
                maxX: boundsWgs84.maxX,
                maxY: boundsWgs84.maxY,
                key,
            });

            // Depth distribution — merged here, no second pass needed
            const depth = keyArray[0];
            this._cycleState.depthDistribution.set(
                depth,
                (this._cycleState.depthDistribution.get(depth) ?? 0) + 1,
            );
            if (depth > this._cycleState.maxDepthInHierarchy) {
                this._cycleState.maxDepthInHierarchy = depth;
            }
        }
    }

    private _calculateNodeBounds(keyArray: NodeKey): {
        bounds: BBox3D;
        boundsWgs84: BBox3D;
    } {
        const [depth, x, y, z] = keyArray;

        const cube = this._originalOctreeCube;
        const cubeMinX = cube[0];
        const cubeMinY = cube[1];
        const cubeMinZ = cube[2];
        const cubeMaxX = cube[3];
        const cubeMaxY = cube[4];
        const cubeMaxZ = cube[5];

        const sizeX = cubeMaxX - cubeMinX;
        const sizeY = cubeMaxY - cubeMinY;
        const sizeZ = cubeMaxZ - cubeMinZ;

        const scale = 1 / Math.pow(2, depth);
        const nodeSizeX = sizeX * scale;
        const nodeSizeY = sizeY * scale;
        const nodeSizeZ = sizeZ * scale;

        const minX = cubeMinX + x * nodeSizeX;
        const minY = cubeMinY + y * nodeSizeY;
        const minZ = cubeMinZ + z * nodeSizeZ;

        const bounds = {
            minX,
            minY,
            minZ,
            maxX: minX + nodeSizeX,
            maxY: minY + nodeSizeY,
            maxZ: minZ + nodeSizeZ,
        };

        let boundsWgs84 = bounds;
        if (this._needsTransform && this._transformer) {
            const [rawSwLng, rawSwLat] = this._transformer([minX, minY]);
            const [rawNeLng, rawNeLat] = this._transformer([
                minX + nodeSizeX,
                minY + nodeSizeY,
            ]);

            // Clamp transformed coordinates to valid WGS84 range
            const [sw_lng, sw_lat] = clampLatLng(rawSwLng, rawSwLat);
            const [ne_lng, ne_lat] = clampLatLng(rawNeLng, rawNeLat);

            boundsWgs84 = {
                minX: Math.min(sw_lng, ne_lng),
                minY: Math.min(sw_lat, ne_lat),
                minZ: minZ,
                maxX: Math.max(sw_lng, ne_lng),
                maxY: Math.max(sw_lat, ne_lat),
                maxZ: minZ + nodeSizeZ,
            };
        }

        return { bounds, boundsWgs84 };
    }

    private async _loadNode(node: CachedNode): Promise<void> {
        if (node.state === "loaded" || node.state === "loading") return;

        this._cycleState.totalLoadedPoints += node.pointCount;

        node.state = "loading";

        try {
            const hierarchyNode: Hierarchy.Node = {
                pointCount: node.pointCount,
                pointDataOffset: node.pointDataOffset,
                pointDataLength: node.pointDataLength,
            };

            const view = await Copc.loadPointDataView(
                this._source,
                this._copc!,
                hierarchyNode,
                { lazPerf: this._lazPerf! },
            );

            if (node.state !== "loading") return;

            await this._extractAndProcessNode(view, node);

            node.state = "loaded";
            const loadMeta = this._metadata.loadMeta(node);
            loadMeta.loadedAtFrame = this._cycleState.frameCounter;
            this._cycleState.totalLoadedNodes++;
            this._eviction.touch(node);
        } catch (error) {
            this._handleLoadError(node, error);
        } finally {
            this._finalizeLoad(node);
        }
    }

    /**
     * Process a load error: release budget, classify error type,
     * schedule retry with exponential backoff.
     */
    private _handleLoadError(node: CachedNode, error: unknown): void {
        if (node.state === "loading") {
            this._cycleState.totalLoadedPoints -= node.pointCount;
            delete node.positions;
            delete node.colorsRgb;
            delete node.colorsElevation;
            delete node.colorsIntensity;
            delete node.colorsClassification;
            delete node.intensities;
            delete node.classifications;
        }

        const isAbort =
            error instanceof DOMException && error.name === "AbortError";

        if (isAbort) {
            node.state = "pending";
        } else {
            node.state = "error";
            node.error = error instanceof Error ? error.message : String(error);
            this._nodeLoader.addErrorNode(node.key);
            const delayMs = computeRetryDelay(node.error, node.retryCount ?? 0);
            node.retryAt = Date.now() + delayMs;
            node.retryCount = (node.retryCount ?? 0) + 1;
        }
    }

    /**
     * Finalize a load cycle: decrement request counter, clean up load metadata,
     * requeue expired errors when idle, drain remaining queue items, signal completion.
     */
    private _finalizeLoad(node: CachedNode): void {
        const meta = this._metadata.load.get(node);
        if (meta) {
            delete meta.loadController;
        }
        this._nodeLoader.onLoadSettled();
    }

    private async _extractAndProcessNode(
        view: View,
        node: CachedNode,
    ): Promise<void> {
        await this._dataExtractor!.extract(view, node);
    }

    /**
     * Request a new load cycle. Called by selectNodesSSE (which is called by
     * the adapter on viewport change).
     *
     * Delegates FSM management to CycleRunner.
     */
    private _requestCycle(input: CycleInput): void {
        this._cycleRunner.request(input);
    }

    /**
     * A single load cycle: delegates to CycleExecutor.
     */
    private async _runCycle(input: CycleInput): Promise<void> {
        if (!this._isInitialized || !this._rootHierarchyPage) {
            throw new Error("Loader not initialized");
        }
        if (!this._geometricErrorByDepth) return;
        if (!this._hierarchyTracker) return;

        await this._cycleExecutor!.run(input, (retryInput) =>
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

    getLoadedPointCloudData(): PointCloudData {
        return this._cycleExecutor!.getLoadedPointCloudData();
    }

    setOnPointsLoaded(callback: (data: PointCloudData) => void): void {
        this._cycleState.onPointsLoaded = callback;
    }

    switchScheme(scheme: ColorScheme): void {
        this._cycleState.activeScheme = scheme;
        this._cycleState.lastVisibleSetHash = 0;
        if (this._cycleExecutor) {
            this._cycleExecutor.run(
                {
                    cameraSnapshot: this._cycleState.lastCameraSnapshot!,
                    viewportBounds: [0, 0, 0, 0],
                },
                (input) => this._requestCycle(input),
            );
        }
    }

    /** Save latest camera snapshot. Render update happens at end of _runCycle only. */
    setCameraSnapshot(snapshot: CameraSnapshot): void {
        this._cycleState.lastCameraSnapshot = snapshot;
    }

    destroy(): void {
        if (this._workerPool) {
            this._workerPool.dispose();
            this._workerPool = null;
        }
        this._nodeCache.clear();
        this._hierarchyTracker?.clear();
    }
}
