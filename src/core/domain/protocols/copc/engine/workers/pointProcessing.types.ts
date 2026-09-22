/**
 * Shared types for the point-processing worker and main thread.
 * Uses only primitive types and TypedArrays — no @core alias dependencies.
 */

/** Raw LAS fields extracted from a COPC View before worker processing. */
export interface RawLasFields {
    x: Float64Array;
    y: Float64Array;
    z: Float32Array;
    intensity: Uint16Array;
    classification: Uint8Array;
    r: Uint16Array | null;
    g: Uint16Array | null;
    b: Uint16Array | null;
}

/** Worker request to process one node's raw LAS fields. */
export interface ProcessRequest {
    kind: "process";
    requestId: string;
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
    globalBounds: [number, number, number, number, number, number] | null;
}

/**
 * Deferred color computation for an already-loaded node. All input arrays
 * are job-owned copies sent by the recolor path — the worker transfers them
 * in, so main-thread buffers never detach while a job is in flight.
 */
export interface RecolorRequest {
    kind: "recolor";
    requestId: string;
    /** Mirrors contracts ColorScheme minus RGB (RGB is always eager). */
    scheme: "elevation" | "intensity" | "classification";
    intensities: Float32Array | null;
    classifications: Uint8Array | null;
    heights: Float32Array | null;
    globalBounds: [number, number, number, number, number, number] | null;
}

/** Either kind of work the worker accepts. */
export type EngineRequest = ProcessRequest | RecolorRequest;

/**
 * Response to a process request. Only the active-at-load scheme's colors are
 * produced (RGB, which needs source channels that exist solely here);
 * every other scheme derives later via a recolor request.
 * All TypedArrays are Transferable.
 */
export interface ProcessResult {
    kind: "process";
    requestId: string;
    positions: Float32Array;
    colorsRgb: Uint8Array;
    intensities: Float32Array;
    classifications: Uint8Array;
}

/** Response to a recolor request; `colors` is Transferable. */
export interface RecolorResult {
    kind: "recolor";
    requestId: string;
    colors: Uint8Array;
}

/** Any response the worker posts back. */
export type EngineResult = ProcessResult | RecolorResult;
