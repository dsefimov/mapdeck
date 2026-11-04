/* global self */
// Runs off the main thread to prevent UI freezes during large point cloud loads.

import proj4 from "proj4";
import { extractProjcsFromWkt } from "../geometry/crs";
import { clampLatLng } from "../geometry/wgs84";
import {
    deriveClassificationColors,
    deriveElevationColors,
    deriveIntensityColors,
    deriveRgbColors,
    extractHeights,
    getElevationParams,
} from "../../logic/colorize";
import type {
    DerivableScheme,
    EngineRequest,
    EngineResult,
    ProcessRequest,
    ProcessResult,
    RecolorRequest,
    RecolorResult,
} from "./pointProcessing.types";

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

/**
 * Turns raw LAS fields into render-ready buffers: reprojected positions,
 * unit intensities, the true-color (RGB) scheme and — when one is requested
 * — the active-at-load scheme's colors derived from the arrays this job has
 * just built, byte-identically to the recolor path. Every other scheme
 * derives later via a recolor request. Pure — the message tail below is the
 * only side effect.
 */
export function process(req: ProcessRequest): ProcessResult {
    const { pointCount, coordinateOrigin } = req;

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

    const intensities = new Float32Array(pointCount);
    for (let i = 0; i < pointCount; i++) {
        intensities[i] = req.rawIntensity[i]! / 65535;
    }

    const classifications = new Uint8Array(req.rawClassification);

    return {
        kind: "process",
        requestId: req.requestId,
        positions,
        colorsRgb: deriveRgbColors(
            { r: req.rawR, g: req.rawG, b: req.rawB },
            req.hasColor,
            pointCount,
        ),
        colorsActive: deriveActive(
            req.activeScheme,
            { positions, intensities, classifications },
            req.globalBounds,
        ),
        intensities,
        classifications,
    };
}

/**
 * Derives the requested scheme's colors from the arrays the process job has
 * just produced — the exact inputs the recolor path would copy and send, so
 * both paths return byte-identical buffers.
 */
function deriveActive(
    scheme: DerivableScheme | null,
    processed: {
        positions: Float32Array;
        intensities: Float32Array;
        classifications: Uint8Array;
    },
    globalBounds: ProcessRequest["globalBounds"],
): Uint8Array | null {
    switch (scheme) {
        case "elevation":
            return deriveElevationColors(
                extractHeights(processed.positions),
                getElevationParams(globalBounds),
            );
        case "intensity":
            return deriveIntensityColors(processed.intensities);
        case "classification":
            return deriveClassificationColors(processed.classifications);
        default:
            return null;
    }
}

/**
 * Derives one lazily-requested color buffer from already-retained per-point
 * arrays. Pure — the message tail below is the only side effect.
 */
export function recolor(req: RecolorRequest): RecolorResult {
    switch (req.scheme) {
        case "elevation":
            return {
                kind: "recolor",
                requestId: req.requestId,
                colors: deriveElevationColors(
                    req.heights!,
                    getElevationParams(req.globalBounds),
                ),
            };
        case "intensity":
            return {
                kind: "recolor",
                requestId: req.requestId,
                colors: deriveIntensityColors(req.intensities!),
            };
        case "classification":
            return {
                kind: "recolor",
                requestId: req.requestId,
                colors: deriveClassificationColors(req.classifications!),
            };
    }
}

self.onmessage = (e: MessageEvent<EngineRequest>) => {
    const req = e.data;
    const result: EngineResult = req.kind === "recolor" ? recolor(req) : process(req);
    const workerScope = self as unknown as {
        postMessage(message: EngineResult, transfer: Transferable[]): void;
    };
    workerScope.postMessage(result, transferOf(result));
};

function transferOf(result: EngineResult): Transferable[] {
    return result.kind === "recolor"
        ? [result.colors.buffer]
        : [
              result.positions.buffer,
              result.colorsRgb.buffer,
              ...(result.colorsActive ? [result.colorsActive.buffer] : []),
              result.intensities.buffer,
              result.classifications.buffer,
          ];
}
