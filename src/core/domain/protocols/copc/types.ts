import type { BBox3D } from "@core/lib/geo";

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
     * Maximum concurrent node requests
     */
    maxConcurrentRequests: number;

    /**
     * Maximum octree depth to load
     */
    maxOctreeDepth: number;

    /**
     * Fraction of pointBudget at which LRU eviction starts.
     * Range: (0, 1). Default: 0.8 (evict when 80% of budget is occupied).
     * Lower = more aggressive eviction, less re-loading thrash.
     */
    evictionThresholdRatio?: number;
}

/**
 * State of a node in the streaming cache
 */
export type NodeState = "pending" | "loading" | "loaded" | "error";

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
    bounds: BBox3D;
    /** Bounding box in WGS84 (same as bounds for EPSG:4326) */
    boundsWgs84: BBox3D;
    /** Load-queue rank carried over from the traversal — lower loads first. */
    priority?: number;
    /** Per-node position data (pointCount × 3, Float32). Only set when state === "loaded". */
    positions?: Float32Array;
    /**
     * Per-node color buffers (pointCount × 4, RGBA, Uint8) — one per scheme.
     * RGB is computed eagerly at load; the other schemes are derived lazily
     * on first use by the scheme colorizer and cached here until eviction.
     */
    colorsRgb?: Uint8Array;
    colorsElevation?: Uint8Array;
    colorsIntensity?: Uint8Array;
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

    /** Parent reference — the ancestor chain the covered-node check walks. */
    parent?: CachedNode | null;
}

/**
 * Viewport information for node selection
 */
export interface ViewportInfo {
    /** Viewport bounds in WGS84 [west, south, east, north] */
    bounds: [number, number, number, number];
}

/** Candidate node produced by SSE traversal — carries pre-computed metrics for priority/budget. */
export interface CandidateNode {
    key: string;
    screenError: number;
    /** Packed multi-criteria rank from `updatePriority` — lower is more urgent. */
    priority: number;
    distanceToCamera: number;
}

/**
 * Result of budget planning: which nodes to accept, which to load, and how many
 * additional points need to be freed before loading can begin.
 */
export interface BudgetPlan {
    /** Node keys accepted for this cycle, most urgent first — by ascending rank. */
    accepted: string[];
    /** Node keys to load (accepted but not yet in memory). */
    toLoad: string[];
    /** Additional points that need to be freed before toLoad can start. */
    deficit: number;
}

/**
 * State of the request loop FSM.
 * - `Idle`: no active cycle, ready to start.
 * - `Running`: a cycle is in progress.
 * - `Dirty`: a cycle is in progress AND a new request arrived — one more cycle
 *   will run after the current one completes.
 */
export enum LoopState {
    Idle = "Idle",
    Running = "Running",
    Dirty = "Dirty",
}

/** Registry id of the COPC protocol — single owner of the literal. */
export const COPC_PROTOCOL_ID = "copc";
