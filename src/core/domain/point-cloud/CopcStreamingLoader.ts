/* global navigator */
import proj4 from "proj4";
import { Copc, Hierarchy, Getter } from "copc";
import type { Copc as CopcType, View } from "copc";
import { createLazPerf, type LazPerf } from "laz-perf";
import RBush from "rbush";

import { logger } from "@core/shared/diagnostics/logger";
import { perfTracker } from "@core/shared/diagnostics/PerfTracker";

proj4.defs(
    "EPSG:3857",
    "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs",
);
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
import { ColorScheme } from "@core/framework/types";
import type {
    NodeKey,
    CachedNode,
    StreamingLoaderOptions,
    StreamingSource,
    PointCloudData,
    PointCloudBounds,
    EvictionPlan,
    LoopState,
} from "@core/framework/types";
import { WorkerPool } from "./workers/WorkerPool";
import { MinHeap } from "@core/shared/async/MinHeap";
import { computeRootSpacing, computeGeometricError } from "./geometry";
import { buildProjection } from "./geometry";
import { traverseOctree } from "./traversal";
import { computeBudgetPlan } from "./budget/computeBudgetPlan";
import { computeEvictionPlan } from "./budget/computeEvictionPlan";
import { shouldRetryAfterTruncation } from "./budget/shouldRetryAfterTruncation";
import { computeVisibleCachedNodes } from "./render/computeVisibleCachedNodes";
import {
    DEFAULT_POINT_BUDGET,
    DEFAULT_MAX_SCREEN_ERROR_PX,
} from "./streamingConfig";
import { HierarchyLoadTracker } from "./hierarchy/HierarchyLoadTracker";
import type { OnNodesDiscovered } from "./hierarchy/HierarchyLoadTracker";
import type { EffectiveBaseline } from "./adaptiveBudget";
import type { CameraSnapshot } from "./geometry";

/** Bounding box entry for rbush spatial index. */
interface NodeBBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    key: string;
}

/** Raw position dimensions extracted from a View. */
interface RawPositions {
    x: Float64Array;
    y: Float64Array;
    z: Float32Array;
}
/** Raw scalar attributes extracted from a View. */
interface RawScalars {
    intensity: Uint16Array;
    classification: Uint8Array;
}
/** Raw color channels extracted from a View. */
interface RawColor {
    r: Uint16Array;
    g: Uint16Array;
    b: Uint16Array;
}

/** Payload sent to the point-processing worker. Mirrors ProcessRequest minus requestId (added by WorkerPool). */
interface ProcessPayload {
    pointCount: number;
    rawX: Float64Array;
    rawY: Float64Array;
    rawZ: Float32Array;
    rawIntensity: Uint16Array;
    rawClassification: Uint8Array;
    rawR: Uint16Array | null;
    rawG: Uint16Array | null;
    rawB: Uint16Array | null;
    hasColor: boolean;
    wkt: string | null;
    coordinateOrigin: [number, number, number];
    globalBounds: [number, number, number, number, number, number];
}

/**
 * Creates a getter function from an ArrayBuffer for copc.js
 */
function createBufferGetter(buffer: ArrayBuffer): Getter {
    const uint8 = new Uint8Array(buffer);
    return async (begin: number, end: number): Promise<Uint8Array> => {
        return new Uint8Array(uint8.subarray(begin, end));
    };
}

/**
 * Resolves a URL to absolute URL. If URL is relative, resolves against current origin.
 */
function resolveUrl(url: string): string {
    // If already absolute (http/https), return as-is
    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }

    // In browser environment, resolve relative to current origin
    if (typeof window !== "undefined" && window.location) {
        try {
            return new URL(url, window.location.origin).href;
        } catch {
            // If URL resolution fails, return original
            // Exception intentionally ignored to fall back to original URL
            return url;
        }
    }

    // In non-browser environment or if window is not available
    // We'll assume it's a relative path that should be resolved by the server
    return url;
}

// LazPerf instance for COPC decompression
let lazPerfInstance: LazPerf | null = null;

async function getLazPerf(): Promise<LazPerf> {
    if (!lazPerfInstance) {
        lazPerfInstance = await createLazPerf({
            locateFile: (path: string) => {
                // Load WASM from CDN for reliable loading
                if (path.endsWith(".wasm")) {
                    return "https://unpkg.com/laz-perf@0.0.7/lib/web/laz-perf.wasm";
                }
                return path;
            },
        });
    }
    return lazPerfInstance;
}

/**
 * Clamps latitude and longitude values to valid WGS84 ranges.
 */
function clampLatLng(lng: number, lat: number): [number, number] {
    let clampedLng = lng;
    let clampedLat = lat;

    if (lat > 90) {
        clampedLat = 90;
    } else if (lat < -90) {
        clampedLat = -90;
    }

    if (lng > 180) {
        clampedLng = 180;
    } else if (lng < -180) {
        clampedLng = -180;
    }

    return [clampedLng, clampedLat];
}

/**
 * Extracts PROJCS part from WKT string for coordinate transformation.
 */
function extractProjcsFromWkt(wkt: string): string {
    if (wkt.startsWith("COMPD_CS[")) {
        const projcsStart = wkt.indexOf("PROJCS[");
        if (projcsStart === -1) return wkt;

        let depth = 0;
        let projcsEnd = projcsStart;
        for (let i = projcsStart; i < wkt.length; i++) {
            if (wkt[i] === "[") depth++;
            if (wkt[i] === "]") {
                depth--;
                if (depth === 0) {
                    projcsEnd = i + 1;
                    break;
                }
            }
        }
        return wkt.substring(projcsStart, projcsEnd);
    }
    return wkt;
}

/**
 * Builds a PointCloudBounds from SW/NE corners, clamping lat/lng to valid WGS84 ranges.
 */
function buildBoundsFromCorners(
    sw: [number, number],
    ne: [number, number],
    minZ: number,
    maxZ: number,
): PointCloudBounds {
    const [minLng, minLat] = clampLatLng(...sw);
    const [maxLng, maxLat] = clampLatLng(...ne);
    return {
        minX: Math.min(minLng, maxLng),
        minY: Math.min(minLat, maxLat),
        minZ,
        maxX: Math.max(minLng, maxLng),
        maxY: Math.max(minLat, maxLat),
        maxZ,
    };
}

/**
 * Input for a single request cycle. Packs all camera/viewport state needed
 * to run traversal → budget → eviction → load.
 */
interface ViewportRequestInput {
    cameraSnapshot: CameraSnapshot;
    viewportBounds: [number, number, number, number];
}

/**
 * Simplified COPC streaming loader for EPSG:4326.
 * Assumes all data is already in WGS84 degrees, no coordinate transformations needed.
 */
export class CopcStreamingLoader {
    private _originalSource: StreamingSource;
    private _source: string | Getter = "";
    private _copc: CopcType | null = null;
    private _lazPerf: LazPerf | null = null;
    private _options: StreamingLoaderOptions;
    private static readonly ERROR_COPC_NOT_INITIALIZED =
        "Copc instance not initialized";

    private _hierarchyTracker: HierarchyLoadTracker | null = null;
    private _rootHierarchyPage: Hierarchy.Page | null = null;
    private _nodeCache = new Map<string, CachedNode>();

    private _renderPositions: Float32Array | null = null;
    private _renderColors: Uint8Array | null = null;
    private _renderCapacity = 0;

    private _lastVisibleSetHash = "";
    private _lastCameraSnapshot: CameraSnapshot | null = null;

    private _coordinateOrigin: [number, number, number] = [0, 0, 0];
    private _bounds: PointCloudBounds = {
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 0,
        maxY: 0,
        maxZ: 0,
    };

    private _loadingQueue = new MinHeap<CachedNode>(
        (a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity),
    );
    private _activeRequests = 0;
    private _totalLoadedPoints = 0;
    private _totalLoadedNodes = 0;
    private _isInitialized = false;

    private _loopState: LoopState = "idle";
    private _pendingInput: ViewportRequestInput | null = null;
    /** Resolves when all active requests settle and the queue is empty — set by _drainQueue. */
    private _drainResolve: (() => void) | null = null;

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

    private _depthDistribution = new Map<number, number>();
    private _maxDepthInHierarchy = 0;

    private _spatialIndex = new RBush<NodeBBox>();

    private _onPointsLoaded: ((data: PointCloudData) => void) | null = null;

    private _transformer:
        | ((coord: [number, number]) => [number, number])
        | null = null;
    private _needsTransform: boolean = false;
    private _workerPool: WorkerPool | null = null;
    private _activeScheme: ColorScheme = ColorScheme.RGB;

    private _rootSpacing = 0;
    private _geometricErrorByDepth: ((depth: number) => number) | null = null;
    private _effectiveBaseline: EffectiveBaseline = {
        maxScreenErrorPx: DEFAULT_MAX_SCREEN_ERROR_PX,
        pointBudget: DEFAULT_POINT_BUDGET,
    };
    /** Monotonically incrementing frame counter for recency-based eviction. */
    private _frameCounter = 0;
    /** Keys of nodes currently in "error" state — O(1) lookup for retry. */
    private _errorKeys = new Set<string>();

    constructor(source: StreamingSource, options: StreamingLoaderOptions) {
        this._originalSource = source;
        this._options = options;
    }

    private _validateSource(): void {
        if (!this._originalSource) {
            throw new Error("CopcStreamingLoader: Source is null or undefined");
        }
    }

    private static getWorkerPoolSize(): number {
        const cpuCount =
            typeof navigator !== "undefined"
                ? (navigator.hardwareConcurrency ?? 4)
                : 4;
        return Math.max(1, Math.min(4, Math.floor(cpuCount / 2)));
    }

    private async _setupSource(): Promise<void> {
        // Setup source - URL string or Getter for local files
        if (typeof this._originalSource === "string") {
            await this._setupUrlSource(this._originalSource);
            return;
        }

        if (this._originalSource instanceof File) {
            const buffer = await this._originalSource.arrayBuffer();
            await this._setupBufferSource(createBufferGetter(buffer), "File");
            return;
        }

        if (this._originalSource instanceof ArrayBuffer) {
            await this._setupBufferSource(
                createBufferGetter(this._originalSource),
                "ArrayBuffer",
            );
            return;
        }

        throw new Error(
            `CopcStreamingLoader: Unsupported source type: ${typeof this._originalSource}. ` +
                `Expected string (URL), File, or ArrayBuffer.`,
        );
    }

    private async _setupUrlSource(urlString: string): Promise<void> {
        const originalUrl = urlString.trim();
        const url = resolveUrl(originalUrl);
        if (!url) {
            throw new Error("CopcStreamingLoader: Source URL is empty");
        }

        this._source = url;
        try {
            this._copc = await Copc.create(url);
        } catch (error) {
            this._handleUrlSourceError(error);
        }
    }

    private _handleUrlSourceError(error: unknown): never {
        if (error instanceof TypeError && error.message === "Failed to fetch") {
            throw new Error(
                `CopcStreamingLoader: Failed to fetch from URL (CORS error). ` +
                    `Solutions: (1) Download file locally, (2) Use CORS proxy, (3) Host on CORS-enabled server. Original error: ${error.message}`,
            );
        }
        // Check for copc.js specific error
        if (error instanceof Error && error.message.includes("access")) {
            throw new Error(
                `CopcStreamingLoader: Invalid COPC file or URL. The file may not be a valid COPC.LAZ format. Original error: ${error.message}`,
            );
        }

        const errorMessage = `CopcStreamingLoader: Failed to create Copc instance: ${error instanceof Error ? error.message : String(error)}`;
        throw new Error(errorMessage);
    }

    private async _setupBufferSource(
        getter: Getter,
        errorContext: string,
    ): Promise<void> {
        this._source = getter;
        try {
            this._copc = await Copc.create(this._source);
        } catch (error) {
            throw new Error(
                `CopcStreamingLoader: Failed to create Copc instance from ${errorContext}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    private _processCopcInfo(): void {
        if (!this._copc) {
            throw new Error(CopcStreamingLoader.ERROR_COPC_NOT_INITIALIZED);
        }

        const { header, info } = this._copc;

        // Store root hierarchy page for later traversal
        this._rootHierarchyPage = info.rootHierarchyPage;
        this._spacing = info.spacing;
        this._totalPointsInFile = header.pointCount;

        // Store original octree cube in source CRS (meters for projected systems)
        this._originalOctreeCube = info.cube as [
            number,
            number,
            number,
            number,
            number,
            number,
        ];

        // Check if color data is available
        const colorFormats = [2, 3, 5, 7, 8, 10];
        this._hasColor = colorFormats.includes(header.pointDataRecordFormat);
    }

    private _setupCoordinateTransformation(): void {
        if (!this._copc) {
            throw new Error(CopcStreamingLoader.ERROR_COPC_NOT_INITIALIZED);
        }

        if (!this._copc.wkt) {
            throw new Error(
                `CopcStreamingLoader: No WKT found in COPC file. ` +
                    `A WKT coordinate reference system definition is required ` +
                    `to transform point cloud data to WGS84.`,
            );
        }

        try {
            const wktToUse = extractProjcsFromWkt(this._copc.wkt);
            const projConverter = proj4(wktToUse, "EPSG:4326");
            this._transformer = (coord: [number, number]) =>
                projConverter.forward(coord) as [number, number];
            this._needsTransform = true;
        } catch (e) {
            throw new Error(
                `CopcStreamingLoader: Failed to setup coordinate transformation from WKT: ` +
                    `${e instanceof Error ? e.message : String(e)}. ` +
                    `Ensure the WKT string in the COPC file is valid and supported by proj4.`,
            );
        }
    }

    private _calculateBounds(): void {
        if (!this._copc) {
            throw new Error(CopcStreamingLoader.ERROR_COPC_NOT_INITIALIZED);
        }

        const header = this._copc.header;

        if (this._needsTransform && this._transformer) {
            const sw = this._transformer([header.min[0], header.min[1]]);
            const ne = this._transformer([header.max[0], header.max[1]]);
            this._bounds = buildBoundsFromCorners(
                sw,
                ne,
                header.min[2],
                header.max[2],
            );
        } else {
            this._bounds = buildBoundsFromCorners(
                [header.min[0], header.min[1]],
                [header.max[0], header.max[1]],
                header.min[2],
                header.max[2],
            );
        }
    }

    private _setupCoordinateOrigin(): void {
        // Note: _originalOctreeCube already contains cube in source CRS
        // The bounds in this._bounds are in WGS84 degrees

        // Coordinate origin is the center of the bounding box (in degrees)
        this._coordinateOrigin = [
            (this._bounds.minX + this._bounds.maxX) / 2,
            (this._bounds.minY + this._bounds.maxY) / 2,
            0,
        ];
    }

    private _calculateSpacingMeters(): number {
        if (!this._needsTransform && this._spacing > 0) {
            // Data is in degrees, convert to approximate meters
            const centerLat = (this._bounds.minY + this._bounds.maxY) / 2;
            const metersPerDegreeLat = 111320; // meters per degree latitude
            const metersPerDegreeLng =
                111320 * Math.cos((centerLat * Math.PI) / 180);
            const metersPerDegree = Math.min(
                metersPerDegreeLat,
                metersPerDegreeLng,
            );
            return this._spacing * metersPerDegree;
        }
        return this._spacing;
    }

    async initialize(): Promise<{
        bounds: PointCloudBounds;
        totalPoints: number;
        spacing: number;
        spacingMeters: number;
    }> {
        perfTracker.mark("init.start");
        perfTracker.snapshotMemory("before-init");
        perfTracker.start("init.total");
        this._validateSource();
        this._lazPerf = await getLazPerf();
        await this._setupSource();
        this._processCopcInfo();
        this._setupCoordinateTransformation();
        this._calculateBounds();
        this._setupCoordinateOrigin();

        // SSE: compute rootSpacing & geometricError function
        if (this._copc) {
            const header = this._copc.header;
            this._rootSpacing = computeRootSpacing({
                minX: header.min[0],
                minY: header.min[1],
                minZ: header.min[2],
                maxX: header.max[0],
                maxY: header.max[1],
                maxZ: header.max[2],
                spacing: this._spacing,
                totalPoints: this._totalPointsInFile,
            });
            const rs = this._rootSpacing;
            this._geometricErrorByDepth = (d: number) =>
                computeGeometricError(rs, d);
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

        // Initialize hierarchy tracker with deduplication.
        // _processSubtreeNodes is the callback — it only receives fresh (not-yet-registered)
        // nodes from the tracker's per-node dedup layer, preventing RBush duplicates.
        const onNodesDiscovered: OnNodesDiscovered = (subtree) => {
            this._processSubtreeNodes(subtree);
        };
        this._hierarchyTracker = new HierarchyLoadTracker(
            this._source,
            onNodesDiscovered,
        );

        const spacingMeters = this._calculateSpacingMeters();
        this._isInitialized = true;

        perfTracker.end("init.total");
        perfTracker.snapshotMemory("after-init");
        perfTracker.mark("init.complete", {
            totalPoints: this._totalPointsInFile,
            spacing: this._spacing,
            needsTransform: this._needsTransform,
        });

        return {
            bounds: this._bounds,
            totalPoints: this._totalPointsInFile,
            spacing: this._spacing,
            spacingMeters,
        };
    }

    private _parseNodeKey(key: string): NodeKey {
        const parts = key.split("-").map(Number);
        if (parts.length !== 4) {
            throw new Error(`Invalid node key format: ${key}`);
        }
        return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
    }

    private _processSubtreeNodes(subtree: Hierarchy.Subtree): void {
        for (const [key, entry] of Object.entries(subtree.nodes)) {
            if (!entry) continue;

            const keyArray = this._parseNodeKey(key);
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
            this._depthDistribution.set(
                depth,
                (this._depthDistribution.get(depth) ?? 0) + 1,
            );
            if (depth > this._maxDepthInHierarchy) {
                this._maxDepthInHierarchy = depth;
            }
        }
    }

    private _calculateNodeBounds(keyArray: NodeKey): {
        bounds: PointCloudBounds;
        boundsWgs84: PointCloudBounds;
    } {
        const [depth, x, y, z] = keyArray;

        // Root cube from original octree cube in source CRS: [minX, minY, minZ, maxX, maxY, maxZ]
        const cube = this._originalOctreeCube;
        const cubeMinX = cube[0];
        const cubeMinY = cube[1];
        const cubeMinZ = cube[2];
        const cubeMaxX = cube[3];
        const cubeMaxY = cube[4];
        const cubeMaxZ = cube[5];

        // Calculate separate sizes for each axis
        const sizeX = cubeMaxX - cubeMinX;
        const sizeY = cubeMaxY - cubeMinY;
        const sizeZ = cubeMaxZ - cubeMinZ;

        // Each level subdivides by 2 in each dimension
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

        // Transform to WGS84 for viewport intersection if needed
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

    // SSE-driven traversal handles node selection (see selectNodesSSE).

    queueNode(node: CachedNode): void {
        if (node.state !== "pending" && node.state !== "error") return;
        if (node.retryAt && Date.now() < node.retryAt) return;

        // Reset error state if node was in error
        if (node.state === "error") {
            node.state = "pending";
            delete node.error;
        }

        this._loadingQueue.push(node);
    }

    async loadQueuedNodes(): Promise<void> {
        while (
            this._loadingQueue.size > 0 &&
            this._activeRequests < this._options.maxConcurrentRequests
        ) {
            const node = this._loadingQueue.pop()!;

            this._loadNode(node);
        }
    }

    /**
     * Re-enqueue expired error nodes. Limited to maxConcurrentRequests per call
     * to prevent retry storms when many nodes fail simultaneously.
     * Uses _errorKeys set for O(1) lookup instead of scanning all _nodeCache.
     */
    private _requeueExpiredErrors(): void {
        const now = Date.now();
        let enqueued = 0;
        const maxEnqueue = this._options.maxConcurrentRequests;

        for (const key of this._errorKeys) {
            if (enqueued >= maxEnqueue) break;

            const node = this._nodeCache.get(key);
            if (!node || node.state !== "error") {
                this._errorKeys.delete(key);
                continue;
            }
            if (node.retryAt != null && now >= node.retryAt) {
                node.state = "pending";
                delete node.error;
                this._errorKeys.delete(key);
                this._loadingQueue.push(node);
                enqueued++;
            }
        }
    }

    // eslint-disable-next-line complexity
    private async _loadNode(node: CachedNode): Promise<void> {
        if (node.state === "loaded" || node.state === "loading") return;

        // Budget is managed by _runCycle's batch eviction before drainQueue.
        // This guard is a defensive check only — the cycle guarantees space is freed.
        if (
            this._totalLoadedPoints + node.pointCount >
            this._effectiveBaseline.pointBudget
        ) {
            return;
        }

        this._totalLoadedPoints += node.pointCount;

        node.state = "loading";
        this._activeRequests++;

        const spanId = perfTracker.startSpan("node.load");

        try {
            const hierarchyNode: Hierarchy.Node = {
                pointCount: node.pointCount,
                pointDataOffset: node.pointDataOffset,
                pointDataLength: node.pointDataLength,
            };

            perfTracker.start("node.fetch");
            const view = await Copc.loadPointDataView(
                this._source,
                this._copc!,
                hierarchyNode,
                { lazPerf: this._lazPerf! },
            );
            perfTracker.end("node.fetch");

            if (node.state !== "loading") {
                return;
            }

            // Extract raw values on main thread, send to worker for processing.
            // Worker returns per-node typed arrays assigned directly to node.
            await this._extractAndProcessNode(view, node);

            node.state = "loaded";
            this._totalLoadedNodes++;

        } catch (error) {
            // Release budget and per-node arrays on error.
            if (node.state === "loading") {
                this._totalLoadedPoints -= node.pointCount;
                delete node.positions;
                delete node.colorsRgb;
                delete node.colorsElevation;
                delete node.colorsIntensity;
                delete node.colorsClassification;
                delete node.intensities;
                delete node.classifications;
            }
            node.state = "error";
            node.error = error instanceof Error ? error.message : String(error);
            this._errorKeys.add(node.key);
            const retryCount = node.retryCount ?? 0;
            const isCacheError =
                typeof node.error === "string" &&
                node.error.includes("ERR_CACHE_OPERATION_NOT_SUPPORTED");
            const baseDelay = isCacheError ? 10000 : 1000;
            const delayMs = Math.min(baseDelay * Math.pow(2, retryCount), 2000);
            node.retryAt = Date.now() + delayMs;
            node.retryCount = retryCount + 1;
            logger.warn(
                `Failed to load node ${node.key} (retry ${node.retryCount} in ${delayMs}ms):`,
                error,
            );
        } finally {
            perfTracker.endSpan(spanId, "node.load");
            this._activeRequests--;

            // Idle retry: when all requests settled and queue empty,
            // re-enqueue error nodes whose retryAt has expired.
            // Without this, failed nodes would stall until next camera movement.
            if (this._activeRequests === 0 && this._loadingQueue.size === 0) {
                this._requeueExpiredErrors();
            }

            this.loadQueuedNodes();
            this._signalDrainCheck();
        }
    }

    private _extractPositions(view: View, n: number): RawPositions {
        const x = new Float64Array(n);
        const y = new Float64Array(n);
        const z = new Float32Array(n);
        const xGet = view.getter("X");
        const yGet = view.getter("Y");
        const zGet = view.getter("Z");
        for (let i = 0; i < n; i++) {
            x[i] = xGet(i);
            y[i] = yGet(i);
            z[i] = zGet(i);
        }
        return { x, y, z };
    }

    private _extractScalars(view: View, n: number): RawScalars {
        const intensity = new Uint16Array(n);
        const classification = new Uint8Array(n);
        const iGet = view.getter("Intensity");
        const cGet = view.getter("Classification");
        for (let i = 0; i < n; i++) {
            intensity[i] = iGet(i);
            classification[i] = cGet(i);
        }
        return { intensity, classification };
    }

    private _extractColor(view: View, n: number): RawColor {
        const r = new Uint16Array(n);
        const g = new Uint16Array(n);
        const b = new Uint16Array(n);
        const rGet = view.getter("Red");
        const gGet = view.getter("Green");
        const bGet = view.getter("Blue");
        for (let i = 0; i < n; i++) {
            r[i] = rGet(i);
            g[i] = gGet(i);
            b[i] = bGet(i);
        }
        return { r, g, b };
    }

    private _extractRawValues(
        view: View,
        n: number,
    ): {
        positions: RawPositions;
        scalars: RawScalars;
        color: RawColor | null;
    } {
        const positions = this._extractPositions(view, n);
        const scalars = this._extractScalars(view, n);
        const color = this._hasColor ? this._extractColor(view, n) : null;
        return { positions, scalars, color };
    }

    private _buildProcessPayload(
        positions: RawPositions,
        scalars: RawScalars,
        color: RawColor | null,
    ): ProcessPayload {
        return {
            pointCount: positions.x.length,
            rawX: positions.x,
            rawY: positions.y,
            rawZ: positions.z,
            rawIntensity: scalars.intensity,
            rawClassification: scalars.classification,
            rawR: color?.r ?? null,
            rawG: color?.g ?? null,
            rawB: color?.b ?? null,
            hasColor: this._hasColor,
            wkt: this._needsTransform ? (this._copc!.wkt ?? null) : null,
            coordinateOrigin: this._coordinateOrigin,
            globalBounds: [
                this._bounds.minX,
                this._bounds.minY,
                this._bounds.minZ,
                this._bounds.maxX,
                this._bounds.maxY,
                this._bounds.maxZ,
            ],
        };
    }

    private _ensureNodeReadiness(): void {
        if (!this._workerPool) {
            throw new Error("WorkerPool not initialized");
        }
    }

    private async _extractAndProcessNode(
        view: View,
        node: CachedNode,
    ): Promise<void> {
        this._ensureNodeReadiness();

        const workerPool = this._workerPool!;

        perfTracker.start("extract.raw");
        const N = node.pointCount;

        const { positions, scalars, color } = this._extractRawValues(view, N);
        perfTracker.end("extract.raw");

        perfTracker.start("worker.process");

        const transferList: Transferable[] = [
            positions.x.buffer,
            positions.y.buffer,
            positions.z.buffer,
            scalars.intensity.buffer,
            scalars.classification.buffer,
        ];
        if (color) {
            transferList.push(color.r.buffer, color.g.buffer, color.b.buffer);
        }

        const payload = this._buildProcessPayload(positions, scalars, color);

        const result = await workerPool.post<
            ProcessPayload,
            {
                requestId: string;
                positions: Float32Array;
                colorsRgb: Uint8Array;
                colorsElevation: Uint8Array;
                colorsIntensity: Uint8Array;
                colorsClassification: Uint8Array;
                intensities: Float32Array;
                classifications: Uint8Array;
            }
        >(payload, transferList);
        perfTracker.end("worker.process");

        // Assign per-node typed arrays (Transferable from worker — zero-copy)
        node.positions = result.positions;
        node.colorsRgb = result.colorsRgb;
        node.colorsElevation = result.colorsElevation;
        node.colorsIntensity = result.colorsIntensity;
        node.colorsClassification = result.colorsClassification;
        node.intensities = result.intensities;
        node.classifications = result.classifications;
    }

    /**
     * Request a new load cycle. Called by selectNodesSSE (which is called by
     * the adapter on viewport change).
     *
     * If no cycle is active, starts one immediately. If a cycle is already
     * running, the input is saved and one follow-up cycle runs after the
     * current one completes (collapsing any intermediate requests).
     */
    private _requestCycle(input: ViewportRequestInput): void {
        this._pendingInput = input;
        if (this._loopState === "idle") {
            void this._runNext();
        } else {
            this._loopState = "running-dirty";
        }
    }

    /**
     * FSM driver: runs the next cycle if there's a pending input.
     * Transitions: idle → running → (running-dirty → running | idle).
     */
    private async _runNext(): Promise<void> {
        if (!this._pendingInput) {
            this._loopState = "idle";
            return;
        }
        this._loopState = "running";
        const input = this._pendingInput;
        this._pendingInput = null;

        await this._runCycle(input);

        // Re-read loopState — _requestCycle may have set it to "running-dirty"
        // during the await via another camera event. TS narrows the type after
        // the "running" assignment above, so we cast to avoid false positive.
        if ((this._loopState as LoopState) === "running-dirty") {
            // A new request arrived while we were running — go again.
            await this._runNext();
        } else {
            this._loopState = "idle";
        }
    }

    /**
     * A single load cycle: hierarchy → traversal → budget → eviction → load.
     * Runs exactly once per call. Returns when the entire load batch completes.
     */
    // eslint-disable-next-line complexity, sonarjs/cognitive-complexity
    private async _runCycle(input: ViewportRequestInput): Promise<void> {
        const { cameraSnapshot, viewportBounds } = input;

        const viewportHeight =
            typeof window !== "undefined" ? window.innerHeight : 1080;
        this._lastCameraSnapshot = {
            ...cameraSnapshot,
            screenHeightPx: viewportHeight,
        };

        if (!this._isInitialized || !this._rootHierarchyPage) {
            throw new Error("Loader not initialized");
        }
        if (!this._geometricErrorByDepth) {
            return;
        }

        if (!this._hierarchyTracker) {
            return;
        }
        this._depthDistribution.clear();
        this._maxDepthInHierarchy = 0;
        await this._hierarchyTracker.ensureLoaded(
            "0-0-0-0",
            this._rootHierarchyPage,
        );

        let traversalResult = traverseOctree(
            "0-0-0-0",
            this._nodeCache,
            this._spatialIndex,
            this._lastCameraSnapshot,
            viewportBounds,
            this._effectiveBaseline.maxScreenErrorPx,
            this._options.maxOctreeDepth,
            this._geometricErrorByDepth,
        );

        // and re-traverse ONCE within this cycle (not recursively re-entering selectNodesSSE).
        if (traversalResult.pendingHierarchyExpansions.length > 0) {
            const MAX_HIERARCHY_EXPANSIONS = 32;
            const expansions = traversalResult.pendingHierarchyExpansions.slice(
                0,
                MAX_HIERARCHY_EXPANSIONS,
            );

            const rootPages = new Map<string, typeof this._rootHierarchyPage>();
            for (const key of expansions) {
                rootPages.set(key, this._rootHierarchyPage);
            }

            const cacheSizeBefore = this._nodeCache.size;
            const loaded = await this._hierarchyTracker.ensureLoadedMany(
                expansions,
                rootPages as Map<string, import("copc").Hierarchy.Page>,
            );

            if (loaded > 0 || this._nodeCache.size > cacheSizeBefore) {
                traversalResult = traverseOctree(
                    "0-0-0-0",
                    this._nodeCache,
                    this._spatialIndex,
                    this._lastCameraSnapshot,
                    viewportBounds,
                    this._effectiveBaseline.maxScreenErrorPx,
                    this._options.maxOctreeDepth,
                    this._geometricErrorByDepth,
                );
            }
        }

        this._frameCounter++;
        for (const candidate of traversalResult.candidates) {
            const node = this._nodeCache.get(candidate.key);
            if (node) {
                node.lastSeenAt = this._frameCounter;
                node.priority = -candidate.priority;
                node.distanceToCamera = candidate.distanceToCamera;
            }
        }

        const plan = computeBudgetPlan(
            traversalResult.candidates,
            this._nodeCache,
            this._effectiveBaseline.pointBudget,
            traversalResult.fallbacks,
        );

        logger.debug(
            `[FSM] budget: accepted=${plan.accepted.length}, toLoad=${plan.toLoad.length}, deficit=${plan.deficit}`,
        );

        let freedPoints = 0;
        if (plan.deficit > 0) {
            const projector = buildProjection(
                this._lastCameraSnapshot!.cameraPos[0],
                this._lastCameraSnapshot!.cameraPos[1],
            );
            const [camXMeters, camYMeters] = projector.forward([
                this._lastCameraSnapshot!.cameraPos[0],
                this._lastCameraSnapshot!.cameraPos[1],
            ]);
            const cameraPosMeters: [number, number, number] = [
                camXMeters,
                camYMeters,
                this._lastCameraSnapshot!.cameraPos[2],
            ];

            const evictionPlan = computeEvictionPlan(
                this._nodeCache,
                plan.deficit,
                cameraPosMeters,
                projector,
            );
            if (evictionPlan.keysToEvict.length > 0) {
                this._applyEviction(evictionPlan, plan.toLoad);
            }
        }

        const effectiveDeficit = Math.max(0, plan.deficit - freedPoints);
        let finalToLoad = plan.toLoad;
        if (effectiveDeficit > 0) {
            // Not enough space was freed — truncate toLoad to what actually fits.
            const occupiedAfterEviction = this._totalLoadedPoints;
            const remainingBudget =
                this._effectiveBaseline.pointBudget - occupiedAfterEviction;
            const truncated: string[] = [];
            let budgetLeft = Math.max(0, remainingBudget);
            for (const key of plan.toLoad) {
                const node = this._nodeCache.get(key);
                if (node && node.pointCount <= budgetLeft) {
                    truncated.push(key);
                    budgetLeft -= node.pointCount;
                }
            }
            finalToLoad = truncated;

            logger.debug(
                `[FSM] truncated: ${plan.toLoad.length} → ${finalToLoad.length} (budget left=${remainingBudget})`,
            );
        }

        const enqueuedCount = this._enqueueNodes(finalToLoad, traversalResult);
        if (enqueuedCount > 0) {
            await this._drainQueue();
        }

        this._updateRenderAndNotify();

        // schedule a retry. Skip if eviction freed zero points — further
        // cycles with the same input would be futile.
        if (
            shouldRetryAfterTruncation(
                finalToLoad.length,
                plan.toLoad.length,
                freedPoints,
            )
        ) {
            logger.debug(
                "[FSM] retry: schedule follow-up cycle for truncated nodes",
            );
            this._requestCycle(input);
        }
    }

    /**
     * Enqueue a list of node keys for loading. Skips nodes already loading/loaded
     * or on retry cooldown.
     * @returns Number of nodes actually enqueued.
     */
    private _enqueueNodes(
        keys: string[],
        traversalResult: ReturnType<typeof traverseOctree>,
    ): number {
        let count = 0;
        for (const key of keys) {
            const node = this._nodeCache.get(key);
            if (!node || node.state === "loading" || node.state === "loaded") {
                continue;
            }
            if (node.retryAt && Date.now() < node.retryAt) continue;
            if (node.state === "error") {
                node.state = "pending";
                delete node.error;
            }
            const candidate = traversalResult.candidates.find(
                (c) => c.key === key,
            );
            node.priority = candidate ? -candidate.priority : -Infinity;
            this.queueNode(node);
            count++;
        }
        return count;
    }

    /**
     * Drain the loading queue: starts up to maxConcurrentRequests parallel loads
     * and returns a Promise that resolves when ALL in-flight requests complete
     * AND the queue is empty.
     *
     * Uses an event-driven approach: _loadNode's finally block calls
     * _signalDrainCheck after each load settles, which resolves the promise
     * when _activeRequests === 0 and the queue is empty.
     */
    private async _drainQueue(): Promise<void> {
        this.loadQueuedNodes();

        if (this._activeRequests === 0 && this._loadingQueue.size === 0) {
            return;
        }

        return new Promise<void>((resolve) => {
            this._drainResolve = resolve;
            // Check immediately in case loads settled synchronously
            this._signalDrainCheck();
        });
    }

    /** Called after each _loadNode settles. Checks if the drain is complete. */
    private _signalDrainCheck(): void {
        if (!this._drainResolve) return;
        if (this._activeRequests === 0 && this._loadingQueue.size === 0) {
            const resolve = this._drainResolve;
            this._drainResolve = null;
            resolve();
        }
    }

    /**
     * Apply eviction plan. Skips parents whose children are being loaded
     * to prevent visual gaps during zoom transitions.
     */
    private _applyEviction(plan: EvictionPlan, toLoad: string[]): void {
        const toLoadSet = new Set(toLoad);

        for (const key of plan.keysToEvict) {
            const node = this._nodeCache.get(key);
            if (!node || node.state !== "loaded") continue;

            // Defer eviction if children are loading or about to be loaded —
            // parent stays visible until children replace it.
            const childKeys = this._childKeysOf(key);
            const hasChildLoading = childKeys.some((ck) => {
                const child = this._nodeCache.get(ck);
                return child?.state === "loading" || toLoadSet.has(ck);
            });
            if (hasChildLoading) continue;

            this._totalLoadedPoints -= node.pointCount;
            this._totalLoadedNodes--;
            node.state = "pending";
            delete node.positions;
            delete node.colorsRgb;
            delete node.colorsElevation;
            delete node.colorsIntensity;
            delete node.colorsClassification;
            delete node.intensities;
            delete node.classifications;
            this._errorKeys.delete(node.key);
        }
    }

    /** Compute the 8 child keys for an octree node key "D-X-Y-Z". */
    private _childKeysOf(key: string): string[] {
        const [d, x, y, z] = key.split("-").map(Number);
        const dc = d! + 1;
        const children: string[] = [];
        for (let dx = 0; dx <= 1; dx++) {
            for (let dy = 0; dy <= 1; dy++) {
                for (let dz = 0; dz <= 1; dz++) {
                    children.push(
                        `${dc}-${x! * 2 + dx}-${y! * 2 + dy}-${z! * 2 + dz}`,
                    );
                }
            }
        }
        return children;
    }

    /**
     * SSE-based node selection. Called by adapter with frustum footprint + camera position.
     * Thin dispatcher — packs arguments and delegates to the FSM.
     * The actual load cycle runs inside _runCycle.
     */
    async selectNodesSSE(
        camera: CameraSnapshot,
        viewportBounds: [number, number, number, number],
    ): Promise<void> {
        this._requestCycle({ cameraSnapshot: camera, viewportBounds });
    }

    /** Set the effective baseline for SSE-based LOD (maxScreenErrorPx, pointBudget). */
    setEffectiveBaseline(baseline: EffectiveBaseline): void {
        this._effectiveBaseline = baseline;
    }

    // ── Render pipeline ─────────────────────────────────────────────────────

    /** Ensure the render buffer pool has at least `totalPoints` capacity. Grow-only, never shrinks. */
    private _ensureRenderCapacity(totalPoints: number): void {
        if (totalPoints <= this._renderCapacity) return;

        const newCap = Math.max(
            totalPoints,
            this._renderCapacity * 2 || totalPoints,
        );
        this._renderPositions = new Float32Array(newCap * 3);
        this._renderColors = new Uint8Array(newCap * 4);
        this._renderCapacity = newCap;
    }

    /** Build a contiguous render buffer from visible cached nodes' per-node arrays. */
    private _buildRenderBuffer(visibleKeys: string[]): PointCloudData | null {
        const visibleNodes = visibleKeys
            .map((k) => this._nodeCache.get(k)!)
            .filter((n) => n.positions);

        const totalPoints = visibleNodes.reduce((s, n) => s + n.pointCount, 0);
        if (totalPoints === 0) return null;

        logger.debug(
            `[RENDER] tiles=${visibleNodes.length} points=${totalPoints.toLocaleString()}`,
        );

        this._ensureRenderCapacity(totalPoints);

        const rp = this._renderPositions!;
        const rc = this._renderColors!;
        let writeOffset = 0;

        // Sort by key for deterministic layout
        visibleNodes.sort((a, b) => a.key.localeCompare(b.key));

        for (const node of visibleNodes) {
            const np = node.pointCount;
            rp.set(node.positions!, writeOffset * 3);
            this._setActiveColorsForNode(node, rc, writeOffset);
            writeOffset += np;
        }

        return {
            positions: rp.subarray(0, totalPoints * 3),
            coordinateOrigin: this._coordinateOrigin,
            pointCount: totalPoints,
            colors: rc.subarray(0, totalPoints * 4),
            bounds: [
                this._bounds.minX,
                this._bounds.minY,
                this._bounds.minZ,
                this._bounds.maxX,
                this._bounds.maxY,
                this._bounds.maxZ,
            ],
        };
    }

    /** Copy the active color scheme from a node's per-node array into the render buffer. */
    private _setActiveColorsForNode(
        node: CachedNode,
        renderColors: Uint8Array,
        writeOffset: number,
    ): void {
        let src: Uint8Array | undefined;
        switch (this._activeScheme) {
            case ColorScheme.ELEVATION:
                src = node.colorsElevation;
                break;
            case ColorScheme.INTENSITY:
                src = node.colorsIntensity;
                break;
            case ColorScheme.CLASSIFICATION:
                src = node.colorsClassification;
                break;
            case ColorScheme.RGB:
            default:
                src = node.colorsRgb;
                break;
        }
        if (src) {
            renderColors.set(src, writeOffset * 4);
        }
    }

    /** Single source of truth: current visible node keys given the last known camera snapshot. */
    private _computeCurrentVisibleKeys(): string[] | null {
        if (!this._lastCameraSnapshot || !this._geometricErrorByDepth)
            return null;
        return computeVisibleCachedNodes(
            this._nodeCache,
            this._lastCameraSnapshot,
            this._geometricErrorByDepth,
            this._effectiveBaseline.maxScreenErrorPx,
        );
    }

    /** Recompute visible set and notify the adapter if it changed. */
    private _updateRenderAndNotify(): void {
        if (!this._onPointsLoaded) return;
        const visibleKeys = this._computeCurrentVisibleKeys();
        if (!visibleKeys) return;

        const hash = visibleKeys.join(",");
        if (hash === this._lastVisibleSetHash) return;
        this._lastVisibleSetHash = hash;

        const data = this._buildRenderBuffer(visibleKeys);
        if (!data) return;

        this._onPointsLoaded(data);
    }

    getLoadedPointCloudData(): PointCloudData {
        const visibleKeys = this._computeCurrentVisibleKeys();
        if (!visibleKeys) throw new Error("No point data loaded");
        const data = this._buildRenderBuffer(visibleKeys);
        if (!data) throw new Error("No point data loaded");
        return data;
    }

    setOnPointsLoaded(callback: (data: PointCloudData) => void): void {
        this._onPointsLoaded = callback;
    }

    switchScheme(scheme: ColorScheme): void {
        this._activeScheme = scheme;
        // Force render rebuild — visible set hasn't changed, but colors did
        this._lastVisibleSetHash = "";
        this._updateRenderAndNotify();
    }

    /** Public method for the adapter to trigger a render update on viewport change. */
    setCameraSnapshot(snapshot: CameraSnapshot): void {
        this._lastCameraSnapshot = snapshot;
        this._updateRenderAndNotify();
    }

    destroy(): void {
        if (this._workerPool) {
            this._workerPool.dispose();
            this._workerPool = null;
        }
        this._loadingQueue.clear();
        this._nodeCache.clear();
        this._hierarchyTracker?.clear();
    }
}
