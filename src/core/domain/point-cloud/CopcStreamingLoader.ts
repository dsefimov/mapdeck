// mapdeck/src/core/overlay/deck/loaders/CopcStreamingLoader.ts
// COPC streaming loader with coordinate transformation support
// Supports UTM and other projected coordinate systems with transformation to WGS84

/* global navigator */
import proj4 from "proj4";
import { Copc, Hierarchy, Getter } from "copc";
import type { Copc as CopcType, View } from "copc";
import { createLazPerf, type LazPerf } from "laz-perf";
import RBush from "rbush";

import { logger } from "@core/shared/diagnostics/logger";
import { perfTracker } from "@core/shared/diagnostics/PerfTracker";

// Register default projected coordinate systems
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
    ViewportInfo,
    StreamingSource,
    PointCloudData,
    PointCloudBounds,
} from "@core/framework/types";
import { WorkerPool } from "./workers/WorkerPool";
import { MinHeap } from "@core/shared/async/MinHeap";

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

    // Hierarchy and node management
    private _loadedHierarchyKeys = new Set<string>();
    private _rootHierarchyPage: Hierarchy.Page | null = null;
    private _nodeCache = new Map<string, CachedNode>();

    // Data buffers
    private _positions: Float32Array | null = null;
    private _colorsRgb: Uint8Array | null = null;
    private _colorsElevation: Uint8Array | null = null;
    private _colorsIntensity: Uint8Array | null = null;
    private _colorsClassification: Uint8Array | null = null;
    private _intensities: Float32Array | null = null;
    private _classifications: Uint8Array | null = null;

    // Coordinate system (always EPSG:4326 degrees)
    private _coordinateOrigin: [number, number, number] = [0, 0, 0];
    private _bounds: PointCloudBounds = {
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 0,
        maxY: 0,
        maxZ: 0,
    };

    // Loading state
    private _loadingQueue = new MinHeap<CachedNode>(
        (a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity),
    );
    private _queuedKeys = new Set<string>();
    private _activeRequests = 0;
    private _totalLoadedPoints = 0;
    private _totalLoadedNodes = 0;
    private _isInitialized = false;

    // Eviction state
    private _currentViewportCenter: [number, number] = [0, 0];

    // Data characteristics
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

    // Node depth distribution tracking
    private _depthDistribution = new Map<number, number>();
    private _maxDepthInHierarchy = 0;

    // Spatial index for fast viewport intersection queries
    private _spatialIndex = new RBush<NodeBBox>();

    // Event handling
    private _pendingLayerUpdate = false;
    private _updateBatchTimeout: ReturnType<typeof setTimeout> | null = null;
    private _onPointsLoaded: ((data: PointCloudData) => void) | null = null;

    // Coordinate transformation
    private _transformer:
        | ((coord: [number, number]) => [number, number])
        | null = null;
    private _needsTransform: boolean = false;
    private _workerPool: WorkerPool | null = null;
    private _activeScheme: ColorScheme = ColorScheme.RGB;

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
        this._allocateBuffers();
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

    private _allocateBuffers(): void {
        const budget = this._options.pointBudget;
        this._positions = new Float32Array(budget * 3);
        this._intensities = new Float32Array(budget);
        this._classifications = new Uint8Array(budget);
        // Allocate all four color scheme buffers upfront
        this._colorsRgb = new Uint8Array(budget * 4);
        this._colorsElevation = new Uint8Array(budget * 4);
        this._colorsIntensity = new Uint8Array(budget * 4);
        this._colorsClassification = new Uint8Array(budget * 4);
    }

    private _parseNodeKey(key: string): NodeKey {
        const parts = key.split("-").map(Number);
        if (parts.length !== 4) {
            throw new Error(`Invalid node key format: ${key}`);
        }
        return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
    }

    private async _ensureHierarchyLoaded(key: string): Promise<void> {
        if (this._loadedHierarchyKeys.has(key)) {
            return;
        }

        if (!this._rootHierarchyPage || !this._copc) {
            throw new Error("Root hierarchy not loaded");
        }

        perfTracker.start("hierarchy.load");

        // Clear depth distribution before loading new hierarchy
        this._depthDistribution.clear();
        this._maxDepthInHierarchy = 0;

        // Load hierarchy recursively starting from root
        await this._loadHierarchyRecursive(this._rootHierarchyPage);

        perfTracker.end("hierarchy.load");
        perfTracker.mark("hierarchy.complete", {
            nodeCount: this._nodeCache.size,
            maxDepth: this._maxDepthInHierarchy,
        });

        // Log hierarchy summary (DEV only — tree-shaken in production)
        if (import.meta.env.DEV) {
            const depthSummary: Record<string, number> = {};
            this._depthDistribution.forEach((count, depth) => {
                depthSummary[`depth_${depth}`] = count;
            });

            const nodeSizesByDepth: Record<
                string,
                {
                    widthDeg: number;
                    heightDeg: number;
                    widthMeters: number;
                    heightMeters: number;
                }
            > = {};

            for (let depth = 0; depth <= this._maxDepthInHierarchy; depth++) {
                const widthDeg =
                    (this._bounds.maxX - this._bounds.minX) /
                    Math.pow(2, depth);
                const heightDeg =
                    (this._bounds.maxY - this._bounds.minY) /
                    Math.pow(2, depth);
                const widthMetersSource =
                    (this._originalOctreeCube[3] -
                        this._originalOctreeCube[0]) /
                    Math.pow(2, depth);
                const heightMetersSource =
                    (this._originalOctreeCube[4] -
                        this._originalOctreeCube[1]) /
                    Math.pow(2, depth);
                nodeSizesByDepth[`depth_${depth}`] = {
                    widthDeg,
                    heightDeg,
                    widthMeters: widthMetersSource,
                    heightMeters: heightMetersSource,
                };
            }

            const deepNodes: Array<{
                key: string;
                depth: number;
                bounds: PointCloudBounds;
            }> = [];
            for (const node of this._nodeCache.values()) {
                if (node.keyArray[0] >= this._maxDepthInHierarchy - 2) {
                    deepNodes.push({
                        key: node.key,
                        depth: node.keyArray[0],
                        bounds: node.boundsWgs84,
                    });
                    if (deepNodes.length >= 5) break;
                }
            }
        }

        this._loadedHierarchyKeys.add(key);
    }

    private async _loadHierarchyRecursive(page: Hierarchy.Page): Promise<void> {
        // Load subtree for this page
        const subtree = await Hierarchy.load(this._source, page);

        // Process nodes in this subtree
        this._processSubtreeNodes(subtree);

        // Recursively load child pages
        await this._loadChildPages(subtree);
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
                bufferStartIndex: null,
            };

            this._nodeCache.set(key, cachedNode);
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

    private async _loadChildPages(subtree: Hierarchy.Subtree): Promise<void> {
        // Parallel loading of child hierarchy pages — independent HTTP requests
        const pages = Object.values(subtree.pages).filter(
            Boolean,
        ) as Hierarchy.Page[];
        if (pages.length === 0) return;

        await Promise.all(
            pages.map((page) => this._loadHierarchyRecursive(page)),
        );
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

    private _calculateNodePriority(
        nodeBounds: PointCloudBounds,
        viewport: ViewportInfo,
    ): number {
        const nodeCenterX = (nodeBounds.minX + nodeBounds.maxX) / 2;
        const nodeCenterY = (nodeBounds.minY + nodeBounds.maxY) / 2;
        const dx = nodeCenterX - viewport.center[0];
        const dy = nodeCenterY - viewport.center[1];
        return dx * dx + dy * dy; // squared distance
    }

    private _calculateTargetDepth(viewport: ViewportInfo): number {
        // Calculate target depth, clamped to max depth available in hierarchy
        let targetDepth = Math.min(
            Math.max(viewport.targetDepth, 0),
            this._options.maxOctreeDepth,
        );

        // Further clamp to actual max depth in hierarchy (if hierarchy is loaded)
        if (this._maxDepthInHierarchy > 0) {
            targetDepth = Math.min(targetDepth, this._maxDepthInHierarchy);
        }
        return targetDepth;
    }

    private _calculateBufferedBounds(
        viewportBounds: [number, number, number, number],
    ): [number, number, number, number] {
        const [west, south, east, north] = viewportBounds;
        const width = east - west;
        const height = north - south;
        const bufferX = width * 0.2;
        const bufferY = height * 0.2;
        const bufferedWest = west - bufferX;
        const bufferedEast = east + bufferX;
        const bufferedSouth = south - bufferY;
        const bufferedNorth = north + bufferY;
        return [bufferedWest, bufferedSouth, bufferedEast, bufferedNorth];
    }

    private _collectNodesForViewport(
        targetDepth: number,
        viewport: ViewportInfo,
        bufferedBounds: [number, number, number, number],
    ): CachedNode[] {
        const [west, south, east, north] = bufferedBounds;

        // Use spatial index to find all nodes intersecting the viewport
        const candidates = this._spatialIndex.search({
            minX: west,
            minY: south,
            maxX: east,
            maxY: north,
        });

        const nodesToLoad: CachedNode[] = [];

        for (const bbox of candidates) {
            const node = this._nodeCache.get(bbox.key);
            if (!node) continue;

            const depth = node.keyArray[0];

            // Skip nodes deeper than we need
            if (depth > targetDepth + 1) {
                continue;
            }

            // Skip already loaded/loading nodes
            if (node.state === "loaded" || node.state === "loading") {
                continue;
            }

            // Calculate priority: distance from center - depth * 0.0001
            const distPriority = this._calculateNodePriority(
                node.boundsWgs84,
                viewport,
            );
            // Deeper nodes get higher priority (lower priority number)
            node.priority = distPriority - depth * 0.0001;
            nodesToLoad.push(node);
        }

        // Sort by priority (center-first, deeper nodes slightly preferred)
        nodesToLoad.sort(
            (a, b) => (a.priority || Infinity) - (b.priority || Infinity),
        );
        return nodesToLoad;
    }

    async selectNodesForViewport(viewport: ViewportInfo): Promise<void> {
        if (!this._isInitialized || !this._rootHierarchyPage) {
            throw new Error("Loader not initialized");
        }

        perfTracker.start("viewport.selection");

        // Store current viewport center for eviction distance calculations
        this._currentViewportCenter = viewport.center;

        // Ensure hierarchy is loaded (idempotent — no-op after first call)
        if (!this._loadedHierarchyKeys.has("0-0-0-0")) {
            await this._ensureHierarchyLoaded("0-0-0-0");
        }

        const targetDepth = this._calculateTargetDepth(viewport);
        const bufferedBounds = this._calculateBufferedBounds(viewport.bounds);
        const nodesToLoad = this._collectNodesForViewport(
            targetDepth,
            viewport,
            bufferedBounds,
        );

        perfTracker.end("viewport.selection");
        perfTracker.mark("viewport.queued", {
            targetDepth,
            candidateCount: nodesToLoad.length,
            zoom: viewport.zoom.toFixed(1),
        });

        // Add to queue
        for (const node of nodesToLoad) {
            this.queueNode(node);
        }

        // Start loading
        this.loadQueuedNodes().catch((error) => {
            logger.warn(
                "CopcStreamingLoader: failed to load queued nodes",
                error,
            );
        });
    }

    queueNode(node: CachedNode): void {
        if (node.state !== "pending" && node.state !== "error") return;
        if (node.retryAt && Date.now() < node.retryAt) return;
        if (this._queuedKeys.has(node.key)) return;

        // Reset error state if node was in error
        if (node.state === "error") {
            node.state = "pending";
            delete node.error;
        }

        this._queuedKeys.add(node.key);
        this._loadingQueue.push(node);
    }

    async loadQueuedNodes(): Promise<void> {
        while (
            this._loadingQueue.size > 0 &&
            this._activeRequests < this._options.maxConcurrentRequests
        ) {
            const node = this._loadingQueue.pop()!;
            this._queuedKeys.delete(node.key);

            // Reserve buffer space synchronously to prevent race conditions
            // between parallel _loadNode calls
            if (
                this._totalLoadedPoints + node.pointCount >
                this._options.pointBudget
            ) {
                const freed = this._evictNodes(node.pointCount);
                if (
                    freed < node.pointCount &&
                    this._totalLoadedPoints + node.pointCount >
                        this._options.pointBudget
                ) {
                    // Still not enough space — skip this node
                    logger.warn(
                        `CopcStreamingLoader: pointBudget exceeded (${this._totalLoadedPoints}/${this._options.pointBudget}), ` +
                            `skipping node ${node.key} (${node.pointCount} points). ` +
                            `Freed ${freed} points via eviction.`,
                    );
                    continue;
                }
            }

            // Assign buffer slot synchronously before async load
            node.bufferStartIndex = this._totalLoadedPoints;
            this._totalLoadedPoints += node.pointCount;

            logger.debug(
                `[BUDGET] loading node ${node.key} (${node.pointCount} pts), total: ${this._totalLoadedPoints}/${this._options.pointBudget}`,
            );

            // Start loading node (don't await, let multiple load in parallel)
            this._loadNode(node);
        }
    }

    /**
     * Calculates squared distance from viewport center to the closest point
     * on the node's bounding box. If the viewport center is inside the node's
     * bounds, distance is 0. This ensures large top-level nodes that cover
     * the viewport are never evicted.
     */
    private _nodeDistanceToViewport(node: CachedNode): number {
        const cx = this._currentViewportCenter[0];
        const cy = this._currentViewportCenter[1];

        // Distance from point to AABB: 0 if point is inside the box
        const dx = Math.max(
            0,
            node.boundsWgs84.minX - cx,
            cx - node.boundsWgs84.maxX,
        );
        const dy = Math.max(
            0,
            node.boundsWgs84.minY - cy,
            cy - node.boundsWgs84.maxY,
        );

        return dx * dx + dy * dy;
    }

    /**
     * Evicts loaded nodes to free up at least `requiredSpace` points in the buffer.
     * Eviction strategy: remove nodes farthest from the current viewport center.
     * After eviction, compacts the buffer to eliminate gaps.
     * Returns the number of points freed.
     */
    private _evictNodes(requiredSpace: number): number {
        // Collect all loaded nodes with their distance to viewport
        const candidates: Array<{ node: CachedNode; distance: number }> = [];
        for (const node of this._nodeCache.values()) {
            if (node.state === "loaded" && node.bufferStartIndex !== null) {
                candidates.push({
                    node,
                    distance: this._nodeDistanceToViewport(node),
                });
            }
        }

        // Sort by distance descending (farthest first)
        candidates.sort((a, b) => b.distance - a.distance);

        let freedPoints = 0;
        const evictedNodes: CachedNode[] = [];

        for (const { node } of candidates) {
            if (freedPoints >= requiredSpace) break;

            freedPoints += node.pointCount;
            node.state = "pending";
            node.bufferStartIndex = null;
            evictedNodes.push(node);
        }

        if (evictedNodes.length === 0) {
            return 0;
        }

        // Compact buffers to eliminate gaps left by evicted nodes
        this._compactBuffers();

        logger.debug(
            `Evicted ${evictedNodes.length} nodes (${freedPoints} points) to free buffer space`,
        );

        return freedPoints;
    }

    private _shiftColors(
        writeOffset: number,
        readOffset: number,
        endOffset: number,
    ): void {
        const wo = writeOffset * 4;
        const ro = readOffset * 4;
        const eo = endOffset * 4;
        this._colorsRgb?.copyWithin(wo, ro, eo);
        this._colorsElevation?.copyWithin(wo, ro, eo);
        this._colorsIntensity?.copyWithin(wo, ro, eo);
        this._colorsClassification?.copyWithin(wo, ro, eo);
    }

    /**
     * Compacts the pre-allocated buffers by shifting data from remaining loaded nodes
     * to fill gaps left by evicted nodes. Updates bufferStartIndex for all affected nodes.
     */
    private _compactBuffers(): void {
        perfTracker.start("compact.buffers");

        // Collect all loaded nodes sorted by their current bufferStartIndex
        const loadedNodes = [...this._nodeCache.values()]
            .filter((n) => n.state === "loaded" && n.bufferStartIndex !== null)
            .sort(
                (a, b) => (a.bufferStartIndex ?? 0) - (b.bufferStartIndex ?? 0),
            );

        let writeOffset = 0;

        for (const node of loadedNodes) {
            const readOffset = node.bufferStartIndex!;
            if (readOffset !== writeOffset) {
                // Shift position data
                if (this._positions) {
                    this._positions.copyWithin(
                        writeOffset * 3,
                        readOffset * 3,
                        (readOffset + node.pointCount) * 3,
                    );
                }
                // Shift color data (all four schemes)
                this._shiftColors(
                    writeOffset,
                    readOffset,
                    readOffset + node.pointCount,
                );
                // Shift intensity data
                if (this._intensities) {
                    this._intensities.copyWithin(
                        writeOffset,
                        readOffset,
                        readOffset + node.pointCount,
                    );
                }
                // Shift classification data
                if (this._classifications) {
                    this._classifications.copyWithin(
                        writeOffset,
                        readOffset,
                        readOffset + node.pointCount,
                    );
                }
            }
            node.bufferStartIndex = writeOffset;
            writeOffset += node.pointCount;
        }

        this._totalLoadedPoints = writeOffset;

        perfTracker.end("compact.buffers");
    }

    private async _loadNode(node: CachedNode): Promise<void> {
        if (node.state === "loaded" || node.state === "loading") return;

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

            // Extract raw values on main thread, send to worker for processing
            await this._extractAndProcessNode(
                view,
                node,
                node.bufferStartIndex!,
            );

            node.state = "loaded";
            this._totalLoadedNodes++;

            this._scheduleLayerUpdate();
        } catch (error) {
            node.state = "error";
            node.error = error instanceof Error ? error.message : String(error);
            const retryCount = node.retryCount ?? 0;
            const delayMs = Math.min(1000 * Math.pow(2, retryCount), 60000);
            node.retryAt = Date.now() + delayMs;
            node.retryCount = retryCount + 1;
            logger.warn(
                `Failed to load node ${node.key} (retry ${node.retryCount} in ${delayMs}ms):`,
                error,
            );
        } finally {
            perfTracker.endSpan(spanId, "node.load");
            this._activeRequests--;
            // Continue loading more nodes
            this.loadQueuedNodes();
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
        if (
            !this._positions ||
            !this._intensities ||
            !this._classifications ||
            !this._colorsRgb
        ) {
            throw new Error("Buffers not allocated");
        }
        if (!this._workerPool) {
            throw new Error("WorkerPool not initialized");
        }
    }

    private async _extractAndProcessNode(
        view: View,
        node: CachedNode,
        startIndex: number,
    ): Promise<void> {
        this._ensureNodeReadiness();

        const workerPool = this._workerPool!;
        const positionsBuf = this._positions!;
        const intensitiesBuf = this._intensities!;
        const classificationsBuf = this._classifications!;
        const colorsRgbBuf = this._colorsRgb!;
        const colorsElevationBuf = this._colorsElevation!;
        const colorsIntensityBuf = this._colorsIntensity!;
        const colorsClassificationBuf = this._colorsClassification!;

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

        perfTracker.start("extract.write");
        positionsBuf.set(result.positions, startIndex * 3);
        intensitiesBuf.set(result.intensities, startIndex);
        classificationsBuf.set(result.classifications, startIndex);
        colorsRgbBuf.set(result.colorsRgb, startIndex * 4);
        colorsElevationBuf.set(result.colorsElevation, startIndex * 4);
        colorsIntensityBuf.set(result.colorsIntensity, startIndex * 4);
        colorsClassificationBuf.set(
            result.colorsClassification,
            startIndex * 4,
        );
        perfTracker.end("extract.write");
    }

    /**
     * Switches the active color scheme instantly.
     * All four schemes are precomputed — no worker calls needed.
     */
    switchScheme(scheme: ColorScheme): void {
        this._activeScheme = scheme;
        this._scheduleLayerUpdate();
    }

    private _scheduleLayerUpdate(): void {
        if (this._pendingLayerUpdate) {
            return;
        }

        this._pendingLayerUpdate = true;
        this._updateBatchTimeout = setTimeout(() => {
            this._performLayerUpdate();
        }, 50);
    }

    private _performLayerUpdate(): void {
        this._pendingLayerUpdate = false;
        if (this._onPointsLoaded) {
            perfTracker.start("layer.update.prepare");
            const data = this.getLoadedPointCloudData();
            perfTracker.end("layer.update.prepare");

            perfTracker.mark("points.delivered", {
                pointCount: data.pointCount,
                loadedNodes: this._totalLoadedNodes,
            });

            this._onPointsLoaded(data);
        }
    }

    setOnPointsLoaded(callback: (data: PointCloudData) => void): void {
        this._onPointsLoaded = callback;
    }

    getLoadedPointCloudData(): PointCloudData {
        const pointCount = this._totalLoadedPoints;

        if (!this._positions || pointCount === 0) {
            throw new Error("No point data loaded");
        }

        const data: PointCloudData = {
            positions: this._positions.subarray(0, pointCount * 3),
            coordinateOrigin: this._coordinateOrigin,
            pointCount,
            bounds: [
                this._bounds.minX,
                this._bounds.minY,
                this._bounds.minZ,
                this._bounds.maxX,
                this._bounds.maxY,
                this._bounds.maxZ,
            ],
        };

        if (this._colorsRgb) {
            data.colors = this._getActiveColorsBuffer().subarray(
                0,
                pointCount * 4,
            );
        }
        if (this._intensities) {
            data.intensities = this._intensities.subarray(0, pointCount);
        }
        if (this._classifications) {
            data.classifications = this._classifications.subarray(
                0,
                pointCount,
            );
        }

        return data;
    }

    private _getActiveColorsBuffer(): Uint8Array {
        switch (this._activeScheme) {
            case ColorScheme.ELEVATION:
                return this._colorsElevation!;
            case ColorScheme.INTENSITY:
                return this._colorsIntensity!;
            case ColorScheme.CLASSIFICATION:
                return this._colorsClassification!;
            case ColorScheme.RGB:
            default:
                return this._colorsRgb!;
        }
    }

    destroy(): void {
        if (this._updateBatchTimeout) {
            clearTimeout(this._updateBatchTimeout);
        }
        if (this._workerPool) {
            this._workerPool.dispose();
            this._workerPool = null;
        }
        this._loadingQueue.clear();
        this._queuedKeys.clear();
        this._nodeCache.clear();
        this._loadedHierarchyKeys.clear();
        this._colorsRgb = null;
        this._colorsElevation = null;
        this._colorsIntensity = null;
        this._colorsClassification = null;
    }
}
