/* global self */
// Web Worker for point cloud processing: coordinate transformation and color computation.
// Runs off the main thread to prevent UI freezes during large point cloud loads.

import proj4 from "proj4";

// --- Types (inlined — Worker cannot import from @core module aliases) ---

interface ProcessRequest {
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
    colorScheme: string;
    globalBounds: [number, number, number, number, number, number] | null;
}

interface ProcessResult {
    requestId: string;
    positions: Float32Array;
    colors: Uint8Array;
    intensities: Float32Array;
    classifications: Uint8Array;
}

interface ColorOnlyRequest {
    requestId: string;
    pointCount: number;
    positions: Float32Array;
    intensities: Float32Array;
    classifications: Uint8Array;
    colorScheme: string;
    globalBounds: [number, number, number, number, number, number] | null;
}

interface ColorOnlyResult {
    requestId: string;
    colors: Uint8Array;
}

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
    const converter = proj4(extractProjcs(wkt), "EPSG:4326");
    const fn = (coord: [number, number]) =>
        converter.forward(coord) as [number, number];
    transformerCache.set(wkt, fn);
    return fn;
}

function extractProjcs(wkt: string): string {
    if (!wkt.startsWith("COMPD_CS[")) return wkt;
    const start = wkt.indexOf("PROJCS[");
    if (start === -1) return wkt;
    let depth = 0;
    for (let i = start; i < wkt.length; i++) {
        if (wkt[i] === "[") depth++;
        if (wkt[i] === "]" && --depth === 0) return wkt.substring(start, i + 1);
    }
    return wkt;
}

function clampLatLng(lng: number, lat: number): [number, number] {
    return [
        Math.max(-180, Math.min(180, lng)),
        Math.max(-90, Math.min(90, lat)),
    ];
}

// --- Main processing function ---

function process(req: ProcessRequest): ProcessResult {
    const { pointCount, coordinateOrigin } = req;

    // Step 1: coordinate transformation
    const positions = new Float32Array(pointCount * 3);
    const coordBuf: [number, number] = [0, 0];

    if (req.wkt) {
        const transform = getTransformer(req.wkt);
        for (let i = 0; i < pointCount; i++) {
            coordBuf[0] = req.rawX[i]!;
            coordBuf[1] = req.rawY[i]!;
            const [rawLng, rawLat] = transform(coordBuf);
            const [lng, lat] = clampLatLng(rawLng, rawLat);
            positions[i * 3] = lng - coordinateOrigin[0];
            positions[i * 3 + 1] = lat - coordinateOrigin[1];
            positions[i * 3 + 2] = req.rawZ[i]!;
        }
    } else {
        for (let i = 0; i < pointCount; i++) {
            positions[i * 3] = req.rawX[i]! - coordinateOrigin[0];
            positions[i * 3 + 1] = req.rawY[i]! - coordinateOrigin[1];
            positions[i * 3 + 2] = req.rawZ[i]!;
        }
    }

    // Step 2: normalize intensities (0–1)
    const intensities = new Float32Array(pointCount);
    for (let i = 0; i < pointCount; i++) {
        intensities[i] = req.rawIntensity[i]! / 65535;
    }

    // Step 3: classifications (copy as-is)
    const classifications = new Uint8Array(req.rawClassification);

    // Step 4: colors by scheme
    const colors = computeColors(req, positions, intensities, classifications);

    return {
        requestId: req.requestId,
        positions,
        colors,
        intensities,
        classifications,
    };
}

// --- Color computation ---

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

function computeColors(
    req: ProcessRequest,
    positions: Float32Array,
    intensities: Float32Array,
    classifications: Uint8Array,
): Uint8Array {
    const N = req.pointCount;

    switch (req.colorScheme) {
        case "rgb":
            if (req.hasColor && req.rawR && req.rawG && req.rawB) {
                return colorsFromRgb(req.rawR, req.rawG, req.rawB, N);
            }
            return defaultColors(N);

        case "intensity":
            return colorsFromIntensity(intensities);

        case "elevation":
            return colorsFromElevation(positions, N, req.globalBounds);

        case "classification":
            return colorsFromClassification(classifications);

        default:
            return defaultColors(N);
    }
}

function defaultColors(N: number): Uint8Array {
    return new Uint8Array(N * 4).fill(255);
}

function colorsFromRgb(
    rawR: Uint16Array,
    rawG: Uint16Array,
    rawB: Uint16Array,
    N: number,
): Uint8Array {
    const colors = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
        const r = rawR[i]!;
        const g = rawG[i]!;
        const b = rawB[i]!;
        colors[i * 4] = r > 255 ? r >> 8 : r;
        colors[i * 4 + 1] = g > 255 ? g >> 8 : g;
        colors[i * 4 + 2] = b > 255 ? b >> 8 : b;
        colors[i * 4 + 3] = 255;
    }
    return colors;
}

function colorsFromIntensity(intensities: Float32Array): Uint8Array {
    const N = intensities.length;
    const colors = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
        const v = (intensities[i]! * 255) | 0;
        colors[i * 4] = v;
        colors[i * 4 + 1] = v;
        colors[i * 4 + 2] = v;
        colors[i * 4 + 3] = 255;
    }
    return colors;
}

function colorsFromElevation(
    positions: Float32Array,
    N: number,
    globalBounds: [number, number, number, number, number, number] | null,
): Uint8Array {
    const minZ = globalBounds ? globalBounds[2] : 0;
    const maxZ = globalBounds ? globalBounds[5] : 1;
    const range = maxZ - minZ || 1;
    const invRange = 1 / range;

    const colors = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
        const t = (positions[i * 3 + 2]! - minZ) * invRange;
        const tc = Math.max(0, Math.min(1, t));
        colors[i * 4] = (tc * 255) | 0;
        colors[i * 4 + 1] = 0;
        colors[i * 4 + 2] = ((1 - tc) * 255) | 0;
        colors[i * 4 + 3] = 255;
    }
    return colors;
}

function colorsFromClassification(classifications: Uint8Array): Uint8Array {
    const N = classifications.length;
    const colors = new Uint8Array(N * 4);
    const fallback: [number, number, number] = [128, 128, 128];
    for (let i = 0; i < N; i++) {
        const rgb = CLASSIFICATION_COLORS[classifications[i]!] ?? fallback;
        colors[i * 4] = rgb[0];
        colors[i * 4 + 1] = rgb[1];
        colors[i * 4 + 2] = rgb[2];
        colors[i * 4 + 3] = 255;
    }
    return colors;
}

// --- Color-only recomputation (for in-place scheme switching) ---

function computeColorsOnly(req: ColorOnlyRequest): ColorOnlyResult {
    const N = req.pointCount;

    let colors: Uint8Array;

    switch (req.colorScheme) {
        case "intensity":
            colors = colorsFromIntensity(req.intensities);
            break;
        case "elevation":
            colors = colorsFromElevation(req.positions, N, req.globalBounds);
            break;
        case "classification":
            colors = colorsFromClassification(req.classifications);
            break;
        case "rgb":
        default:
            colors = defaultColors(N);
            break;
    }

    return { requestId: req.requestId, colors };
}

// --- Message handler ---

self.onmessage = (e: MessageEvent<ProcessRequest | ColorOnlyRequest>) => {
    const msg = e.data;

    if ("rawX" in msg) {
        // Full processing request
        const result = process(msg as ProcessRequest);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (self as any).postMessage(result, [
            result.positions.buffer,
            result.colors.buffer,
            result.intensities.buffer,
            result.classifications.buffer,
        ]);
    } else {
        // Color-only recompute request
        const result = computeColorsOnly(msg as ColorOnlyRequest);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (self as any).postMessage(result, [result.colors.buffer]);
    }
};
