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

/**
 * A node's compressed point-data bytes plus everything needed to decode and
 * read them inside the worker: the laz-perf wasm URL, the point record
 * layout from the LAS header (the same fields `Las.View.create` consumes)
 * and the extra-bytes VLRs. `compressed` is Transferable.
 */
export interface CompressedPointSource {
    compressed: Uint8Array;
    wasmUrl: string;
    pointCount: number;
    pointDataRecordFormat: number;
    pointDataRecordLength: number;
    scale: [number, number, number];
    offset: [number, number, number];
    extraBytes: readonly unknown[];
}

/** Fields every process request carries regardless of its data source. */
interface ProcessRequestBase {
    kind: "process";
    requestId: string;
    pointCount: number;
    hasColor: boolean;
    /** Scheme whose buffer to derive in the same job; null = RGB only. */
    activeScheme: DerivableScheme | null;
    wkt: string | null;
    coordinateOrigin: [number, number, number];
    globalBounds: [number, number, number, number, number, number] | null;
}

/** Worker request to process one node's already-extracted raw LAS fields. */
export interface ProcessRawRequest extends ProcessRequestBase {
    raw: RawLasFields;
}

/**
 * Worker request to decode and process one node's compressed point data:
 * the laz-perf decompress and the raw extraction run inside the worker,
 * the main thread only fetches the bytes.
 */
export interface ProcessCompressedRequest extends ProcessRequestBase {
    source: CompressedPointSource;
}

/** Worker request to process one node from either source form. */
export type ProcessRequest = ProcessRawRequest | ProcessCompressedRequest;

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

/** A request that failed inside the worker; the pool turns it into a rejection. */
export interface WorkerErrorResult {
    kind: "error";
    requestId: string;
    message: string;
}

/** Any response the worker posts back. */
export type EngineResult = ProcessResult | RecolorResult | WorkerErrorResult;
