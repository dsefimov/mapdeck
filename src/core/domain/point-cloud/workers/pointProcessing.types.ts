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

export interface ProcessRequest {
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

/** Response from the point-processing worker. All TypedArrays are Transferable. */
export interface ProcessResult {
    requestId: string;
    positions: Float32Array;
    colorsRgb: Uint8Array;
    colorsElevation: Uint8Array;
    colorsIntensity: Uint8Array;
    colorsClassification: Uint8Array;
    intensities: Float32Array;
    classifications: Uint8Array;
}
