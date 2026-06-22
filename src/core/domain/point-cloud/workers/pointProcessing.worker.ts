/* global self */
// Web Worker for point cloud processing: coordinate transformation and color computation.
// Runs off the main thread to prevent UI freezes during large point cloud loads.

import proj4 from "proj4";
import { extractProjcsFromWkt } from "../geometry/crs";
import { clampLatLng } from "../geometry/wgs84";
import type { ProcessRequest, ProcessResult } from "./pointProcessing.types";

// --- Transformer cache (WKT → proj4 converter, created once) ---

const transformerCache = new Map<
    string,
    (xy: [number, number]) => [number, number]
>();

function getTransformer(
    wkt: string,
): (xy: [number, number]) => [number, number] {
    const cached = transformerCache.get(wkt);
    if (cached) return cached;

    if (!proj4.defs("EPSG:4326")) {
        proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
    }
    const converter = proj4(extractProjcsFromWkt(wkt), "EPSG:4326");
    const fn = (coord: [number, number]) =>
        converter.forward(coord) as [number, number];
    transformerCache.set(wkt, fn);
    return fn;
}

// --- Classification color map ---

const CLASSIFICATION_COLORS: Record<number, [number, number, number]> = {
    0: [128, 128, 128],
    1: [128, 128, 128],
    2: [165, 113, 78],
    3: [144, 238, 144],
    4: [34, 139, 34],
    5: [0, 100, 0],
    6: [255, 165, 0],
    7: [255, 0, 0],
    8: [128, 128, 128],
    9: [0, 0, 255],
    10: [139, 90, 43],
    11: [128, 128, 128],
    13: [255, 255, 0],
    14: [255, 200, 0],
    15: [200, 200, 0],
    16: [100, 100, 100],
    17: [0, 128, 255],
    18: [255, 0, 255],
};

// --- Main processing function ---

function process(req: ProcessRequest): ProcessResult {
    const { pointCount, coordinateOrigin } = req;
    const N = pointCount;

    const positions = new Float32Array(N * 3);
    const coordBuf: [number, number] = [0, 0];

    if (req.wkt) {
        const transform = getTransformer(req.wkt);
        for (let i = 0; i < N; i++) {
            coordBuf[0] = req.rawX[i]!;
            coordBuf[1] = req.rawY[i]!;
            const [rawLng, rawLat] = transform(coordBuf);
            const [lng, lat] = clampLatLng(rawLng, rawLat);
            positions[i * 3] = lng - coordinateOrigin[0];
            positions[i * 3 + 1] = lat - coordinateOrigin[1];
            positions[i * 3 + 2] = req.rawZ[i]!;
        }
    } else {
        for (let i = 0; i < N; i++) {
            positions[i * 3] = req.rawX[i]! - coordinateOrigin[0];
            positions[i * 3 + 1] = req.rawY[i]! - coordinateOrigin[1];
            positions[i * 3 + 2] = req.rawZ[i]!;
        }
    }

    const intensities = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        intensities[i] = req.rawIntensity[i]! / 65535;
    }

    const classifications = new Uint8Array(req.rawClassification);

    const colors = computeAllColors(
        req,
        positions,
        intensities,
        classifications,
    );

    return {
        requestId: req.requestId,
        positions,
        colorsRgb: colors.colorsRgb,
        colorsElevation: colors.colorsElevation,
        colorsIntensity: colors.colorsIntensity,
        colorsClassification: colors.colorsClassification,
        intensities,
        classifications,
    };
}

// --- Compute all four color schemes in a single interleaved loop ---

function computeAllColors(
    req: ProcessRequest,
    positions: Float32Array,
    intensities: Float32Array,
    classifications: Uint8Array,
): {
    colorsRgb: Uint8Array;
    colorsElevation: Uint8Array;
    colorsIntensity: Uint8Array;
    colorsClassification: Uint8Array;
} {
    const N = req.pointCount;
    const colorsRgb = new Uint8Array(N * 4);
    const colorsElevation = new Uint8Array(N * 4);
    const colorsIntensity = new Uint8Array(N * 4);
    const colorsClassification = new Uint8Array(N * 4);

    const hasRgb =
        req.hasColor &&
        req.rawR !== null &&
        req.rawG !== null &&
        req.rawB !== null;

    const elevParams = getElevationParams(req.globalBounds);

    for (let i = 0; i < N; i++) {
        const off = i * 4;
        if (hasRgb) {
            const r = req.rawR![i]!;
            const g = req.rawG![i]!;
            const b = req.rawB![i]!;
            colorsRgb[off] = r > 255 ? r >> 8 : r;
            colorsRgb[off + 1] = g > 255 ? g >> 8 : g;
            colorsRgb[off + 2] = b > 255 ? b >> 8 : b;
        } else {
            colorsRgb[off] = 255;
            colorsRgb[off + 1] = 255;
            colorsRgb[off + 2] = 255;
        }
        colorsRgb[off + 3] = 255;
        writeIntensityChannel(colorsIntensity, off, intensities[i]!);
        writeElevationChannel(
            colorsElevation,
            off,
            positions[i * 3 + 2]!,
            elevParams,
        );
        writeClassificationChannel(
            colorsClassification,
            off,
            classifications[i]!,
        );
    }

    return {
        colorsRgb,
        colorsElevation,
        colorsIntensity,
        colorsClassification,
    };
}

function getElevationParams(
    globalBounds: [number, number, number, number, number, number] | null,
): { minZ: number; invRange: number } {
    const minZ = globalBounds ? globalBounds[2] : 0;
    const maxZ = globalBounds ? globalBounds[5] : 1;
    const invRange = 1 / (maxZ - minZ || 1);
    return { minZ, invRange };
}

function writeIntensityChannel(
    buf: Uint8Array,
    off: number,
    intensity: number,
): void {
    const v = (intensity * 255) | 0;
    buf[off] = v;
    buf[off + 1] = v;
    buf[off + 2] = v;
    buf[off + 3] = 255;
}

function writeElevationChannel(
    buf: Uint8Array,
    off: number,
    z: number,
    params: { minZ: number; invRange: number },
): void {
    const t = (z - params.minZ) * params.invRange;
    const tc = Math.max(0, Math.min(1, t));
    buf[off] = (tc * 255) | 0;
    buf[off + 1] = 0;
    buf[off + 2] = ((1 - tc) * 255) | 0;
    buf[off + 3] = 255;
}

function writeClassificationChannel(
    buf: Uint8Array,
    off: number,
    cls: number,
): void {
    const fallback: [number, number, number] = [128, 128, 128];
    const rgb = CLASSIFICATION_COLORS[cls] ?? fallback;
    buf[off] = rgb[0];
    buf[off + 1] = rgb[1];
    buf[off + 2] = rgb[2];
    buf[off + 3] = 255;
}

// --- Message handler ---

self.onmessage = (e: MessageEvent<ProcessRequest>) => {
    const result = process(e.data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).postMessage(result, [
        result.positions.buffer,
        result.colorsRgb.buffer,
        result.colorsElevation.buffer,
        result.colorsIntensity.buffer,
        result.colorsClassification.buffer,
        result.intensities.buffer,
        result.classifications.buffer,
    ]);
};
