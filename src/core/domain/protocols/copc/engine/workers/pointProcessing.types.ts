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
    /** Scheme whose buffer to derive in the same job; null = RGB only. */
    activeScheme: DerivableScheme | null;
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

/** The schemes a job can derive from processed arrays (RGB is always eager). */
export type DerivableScheme = RecolorRequest["scheme"];

/** Either kind of work the worker accepts. */
export type EngineRequest = ProcessRequest | RecolorRequest;

/**
 * Response to a process request. RGB colors are always produced (their
 * source channels exist solely here); the scheme active at load rides the
 * same job as `colorsActive`, every other scheme derives later via a
 * recolor request. All TypedArrays are Transferable.
 */
export interface ProcessResult {
    kind: "process";
    requestId: string;
    positions: Float32Array;
    colorsRgb: Uint8Array;
    /** Derived buffer for `ProcessRequest.activeScheme`; null when none was requested. */
    colorsActive: Uint8Array | null;
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
