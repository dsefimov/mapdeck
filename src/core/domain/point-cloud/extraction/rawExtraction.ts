import type { View } from "copc";
import type { BBox3D } from "@core/framework/types";
import type {
    RawLasFields,
    ProcessRequest,
} from "../workers/pointProcessing.types";

/** Convert BBox3D to the tuple format required by ProcessRequest. */
function toBoundsTuple(
    b: BBox3D,
): [number, number, number, number, number, number] {
    return [b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ];
}

/**
 * Read raw LAS fields from a COPC View.
 * Pure function — takes hasColor as explicit parameter.
 */
export function readRawLasFields(
    view: View,
    n: number,
    hasColor: boolean,
): RawLasFields {
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const z = new Float32Array(n);
    const intensity = new Uint16Array(n);
    const classification = new Uint8Array(n);
    let r: Uint16Array | null = null;
    let g: Uint16Array | null = null;
    let b: Uint16Array | null = null;

    const xGet = view.getter("X");
    const yGet = view.getter("Y");
    const zGet = view.getter("Z");
    const iGet = view.getter("Intensity");
    const cGet = view.getter("Classification");

    for (let i = 0; i < n; i++) {
        x[i] = xGet(i);
        y[i] = yGet(i);
        z[i] = zGet(i);
        intensity[i] = iGet(i);
        classification[i] = cGet(i);
    }

    if (hasColor) {
        r = new Uint16Array(n);
        g = new Uint16Array(n);
        b = new Uint16Array(n);
        const rGet = view.getter("Red");
        const gGet = view.getter("Green");
        const bGet = view.getter("Blue");
        for (let i = 0; i < n; i++) {
            r[i] = rGet(i);
            g[i] = gGet(i);
            b[i] = bGet(i);
        }
    }

    return { x, y, z, intensity, classification, r, g, b };
}

/** Context needed to build the worker payload. */
export interface WorkerPayloadContext {
    hasColor: boolean;
    needsTransform: boolean;
    wkt: string | null;
    coordinateOrigin: [number, number, number];
    bounds: BBox3D;
}

/**
 * Build the worker payload from raw LAS fields.
 * Pure function — takes context as explicit parameter.
 */
export function buildWorkerPayload(
    raw: RawLasFields,
    ctx: WorkerPayloadContext,
): Omit<ProcessRequest, "requestId"> {
    return {
        pointCount: raw.x.length,
        rawX: raw.x,
        rawY: raw.y,
        rawZ: raw.z,
        rawIntensity: raw.intensity,
        rawClassification: raw.classification,
        rawR: raw.r,
        rawG: raw.g,
        rawB: raw.b,
        hasColor: ctx.hasColor,
        wkt: ctx.needsTransform ? (ctx.wkt ?? null) : null,
        coordinateOrigin: ctx.coordinateOrigin,
        globalBounds: toBoundsTuple(ctx.bounds),
    };
}
