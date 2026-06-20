// mapdeck/src/core/types/layer/streaming-types.ts

/**
 * COPC loading mode options
 */
export type CopcLoadingMode = "full" | "dynamic";

/**
 * Represents an octree node key in COPC format
 * Format: [depth, x, y, z]
 */
export type NodeKey = [number, number, number, number];

/**
 * Source type for streaming loader - can be URL, File, or ArrayBuffer
 */
export type StreamingSource = string | File | ArrayBuffer;

/**
 * Streaming loader options
 */
export interface StreamingLoaderOptions {
    /**
     * Maximum number of points to keep in memory
     */
    pointBudget: number;

    /**
     * Maximum concurrent node requests
     */
    maxConcurrentRequests: number;

    /**
     * Debounce time for viewport changes in ms
     */
    viewportDebounceMs: number;

    /**
     * Maximum octree depth to load
     */
    maxOctreeDepth: number;

    /**
     * Maximum subtree hierarchies to load per viewport change (EPT only)
     * Increase this for large datasets with many subtrees
     */
    maxSubtreesPerViewport: number;
}

/**
 * Bounding box for point cloud data in WGS84 degrees (EPSG:4326)
 */
export type PointCloudBounds = {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
};

/**
 * State of a node in the streaming cache
 */
export type NodeState = "pending" | "loading" | "loaded" | "error" | "subtree";

/**
 * Cached node data
 */
export interface CachedNode {
    /** String format key: "depth-x-y-z" */
    key: string;
    /** Array format key: [depth, x, y, z] */
    keyArray: NodeKey;
    /** Current state of the node */
    state: NodeState;
    /** Number of points in this node */
    pointCount: number;
    /** Offset in the COPC file for point data */
    pointDataOffset: number;
    /** Length of point data in bytes */
    pointDataLength: number;
    /** Bounding box in source CRS (WGS84 degrees) */
    bounds: PointCloudBounds;
    /** Bounding box in WGS84 (same as bounds for EPSG:4326) */
    boundsWgs84: PointCloudBounds;
    /** Distance from viewport center (for priority queue) - lower = higher priority */
    priority?: number;
    /** Per-node position data (pointCount × 3, Float32). Only set when state === "loaded". */
    positions?: Float32Array;
    /** Per-node pre-computed color data for the RGB scheme (pointCount × 4, RGBA, Uint8). */
    colorsRgb?: Uint8Array;
    /** Per-node pre-computed color data for the elevation scheme. */
    colorsElevation?: Uint8Array;
    /** Per-node pre-computed color data for the intensity scheme. */
    colorsIntensity?: Uint8Array;
    /** Per-node pre-computed color data for the classification scheme. */
    colorsClassification?: Uint8Array;
    /** Per-node intensity data (pointCount, Float32 0-1). Undefined if no intensity channel. */
    intensities?: Float32Array;
    /** Per-node classification data (pointCount, Uint8). Undefined if no classification channel. */
    classifications?: Uint8Array;
    /** Monotonically incrementing traversal-frame counter — last time this node appeared in candidates */
    lastSeenAt?: number;
    /** Euclidean distance from camera to node AABB (meters), updated each traversal */
    distanceToCamera?: number;
    /** Error message if state is 'error' */
    error?: string;
    /** Timestamp (ms) before which this node should not be retried */
    retryAt?: number;
    /** Number of consecutive retries for exponential backoff */
    retryCount?: number;
}

/**
 * Viewport information for node selection
 */
export interface ViewportInfo {
    /** Viewport bounds in WGS84 [west, south, east, north] */
    bounds: [number, number, number, number];
    /** Viewport center in WGS84 [lng, lat] */
    center: [number, number];
    /** Current zoom level */
    zoom: number;
    /** Current pitch (tilt angle in degrees) */
    pitch: number;
}

/**
 * Load options that can be passed to loadPointCloud for streaming
 */
export interface StreamingLoadOptions extends StreamingLoaderOptions {
    /**
     * Loading mode: 'full' for complete load, 'dynamic' for viewport-based streaming
     * @default 'full'
     */
    loadingMode?: CopcLoadingMode;
}

/**
 * Union type for typed arrays used for point attributes
 */
export type AttributeArray =
    | Float64Array
    | Float32Array
    | Uint32Array
    | Uint16Array
    | Uint8Array
    | Int32Array
    | Int16Array
    | Int8Array;

/**
 * Extra point attributes beyond the core dimensions
 */
export type ExtraPointAttributes = Record<string, AttributeArray>;

/**
 * Dimension information for LAS/COPC files
 */
export interface DimensionInfo {
    name: string;
    type: string;
    size: number;
    scale?: number;
    offset?: number;
}

/**
 * COPC metadata information
 */
export interface CopcMetadata {
    lasVersion: string;
    pointDataRecordFormat: number;
    generatingSoftware: string;
    creationDate?: {
        year: number;
        dayOfYear: number;
    };
    scale: [number, number, number];
    offset: [number, number, number];
    nativeBounds: {
        min: [number, number, number];
        max: [number, number, number];
    };
    copcInfo: {
        spacing: number;
        rootHierarchyOffset: number;
        pointSpacing: number;
    };
    dimensions: DimensionInfo[];
}

/** Candidate node produced by SSE traversal — carries pre-computed metrics for priority/budget. */
export interface CandidateNode {
    key: string;
    screenError: number;
    screenProjectedArea: number;
    priority: number;
    distanceToCamera: number;
}

/**
 * Result of budget planning: which nodes to accept, which to load, and how many
 * additional points need to be freed before loading can begin.
 */
export interface BudgetPlan {
    /** Node keys accepted for this cycle (order by priority descending). */
    accepted: string[];
    /** Node keys to load (accepted but not yet in memory). */
    toLoad: string[];
    /** Additional points that need to be freed before toLoad can start. */
    deficit: number;
}

/**
 * Result of eviction planning: which nodes to evict and how many points that frees.
 */
export interface EvictionPlan {
    /** Node keys to evict. */
    keysToEvict: string[];
    /** Total points that will be freed by evicting these nodes. */
    freedPoints: number;
}

/**
 * State of the request loop FSM.
 * - `idle`: no active cycle, ready to start.
 * - `running`: a cycle is in progress.
 * - `running-dirty`: a cycle is in progress AND a new request arrived — one more cycle
 *   will run after the current one completes.
 */
export type LoopState = "idle" | "running" | "running-dirty";
