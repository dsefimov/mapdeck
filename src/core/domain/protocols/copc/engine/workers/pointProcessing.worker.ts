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
    getElevationParams,
} from "../../logic/colorize";
import type {
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
 * unit intensities and the true-color (RGB) scheme. Every other color scheme
 * derives later from the returned arrays via a recolor request. Pure — the
 * message tail below is the only side effect.
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

    return {
        kind: "process",
        requestId: req.requestId,
        positions,
        colorsRgb: deriveRgbColors(
            { r: req.rawR, g: req.rawG, b: req.rawB },
            req.hasColor,
            pointCount,
        ),
        intensities,
        classifications: new Uint8Array(req.rawClassification),
    };
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
              result.intensities.buffer,
              result.classifications.buffer,
          ];
}
