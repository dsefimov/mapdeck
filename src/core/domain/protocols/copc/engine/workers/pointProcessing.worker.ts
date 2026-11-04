/* global self */
// Runs off the main thread to prevent UI freezes during large point cloud loads.

import proj4 from "proj4";
import { createLazPerf, type LazPerf } from "laz-perf";
import { Las } from "copc";
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
import { readRawLasFields } from "../extraction/rawExtraction";
import type {
    CompressedPointSource,
    DerivableScheme,
    EngineRequest,
    EngineResult,
    ProcessRequest,
    ProcessResult,
    RawLasFields,
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

// --- laz-perf instances (one per wasm URL, created once per worker) ---

const lazPerfByUrl = new Map<string, Promise<LazPerf>>();

function getLazPerf(wasmUrl: string): Promise<LazPerf> {
    const cached = lazPerfByUrl.get(wasmUrl);
    if (cached) return cached;

    const promise = createLazPerf({
        locateFile: (path: string) =>
            path.endsWith(".wasm") ? wasmUrl : path,
    });
    lazPerfByUrl.set(wasmUrl, promise);
    return promise;
}

/**
 * Decompresses a node's point data and reads the raw LAS fields — the exact
 * calls the main thread used to run (`Las.PointData.decompressChunk` +
 * `Las.View.create` + `readRawLasFields`), so both paths read identically.
 */
async function decodeSource(
    source: CompressedPointSource,
    hasColor: boolean,
): Promise<RawLasFields> {
    const lazPerf = await getLazPerf(source.wasmUrl);
    const buffer = await Las.PointData.decompressChunk(
        source.compressed,
        {
            pointCount: source.pointCount,
            pointDataRecordFormat: source.pointDataRecordFormat,
            pointDataRecordLength: source.pointDataRecordLength,
        },
        lazPerf,
    );
    const view = Las.View.create(
        buffer,
        {
            pointDataRecordFormat: source.pointDataRecordFormat,
            pointDataRecordLength: source.pointDataRecordLength,
            scale: source.scale,
            offset: source.offset,
        },
        // Parsed by copc's own VLR reader on the main thread and carried
        // here through structured clone — the shape is as trusted as it was
        // before the transfer; the loose type keeps worker types dependency-free.
        source.extraBytes as Parameters<typeof Las.View.create>[2],
    );
    return readRawLasFields(view, source.pointCount, hasColor);
}

/**
 * Turns raw LAS fields into render-ready buffers: reprojected positions,
 * unit intensities, the true-color (RGB) scheme and — when one is requested
 * — the active-at-load scheme's colors derived from the arrays this job has
 * just built, byte-identically to the recolor path. Every other scheme
 * derives later via a recolor request. A compressed source is decoded in
 * this same job — one worker round-trip per node. Pure (aside from the
 * laz-perf instance memo) — the message tail below is the only side effect.
 */
export async function process(req: ProcessRequest): Promise<ProcessResult> {
    const { pointCount, coordinateOrigin } = req;
    const raw: RawLasFields =
        "raw" in req ? req.raw : await decodeSource(req.source, req.hasColor);

    const positions = new Float32Array(pointCount * 3);
    const coordBuf: [number, number] = [0, 0];

    if (req.wkt) {
        const transform = getTransformer(req.wkt);
        for (let i = 0; i < pointCount; i++) {
            coordBuf[0] = raw.x[i]!;
            coordBuf[1] = raw.y[i]!;
            const [rawLng, rawLat] = transform(coordBuf);
            const [lng, lat] = clampLatLng(rawLng, rawLat);
            positions[i * 3] = lng - coordinateOrigin[0];
            positions[i * 3 + 1] = lat - coordinateOrigin[1];
            positions[i * 3 + 2] = raw.z[i]!;
        }
    } else {
        for (let i = 0; i < pointCount; i++) {
            positions[i * 3] = raw.x[i]! - coordinateOrigin[0];
            positions[i * 3 + 1] = raw.y[i]! - coordinateOrigin[1];
            positions[i * 3 + 2] = raw.z[i]!;
        }
    }

    const intensities = new Float32Array(pointCount);
    for (let i = 0; i < pointCount; i++) {
        intensities[i] = raw.intensity[i]! / 65535;
    }

    const classifications = new Uint8Array(raw.classification);

    return {
        kind: "process",
        requestId: req.requestId,
        positions,
        colorsRgb: deriveRgbColors(
            { r: raw.r, g: raw.g, b: raw.b },
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
    const workerScope = self as unknown as {
        postMessage(message: EngineResult, transfer: Transferable[]): void;
    };
    Promise.resolve(
        req.kind === "recolor" ? recolor(req) : process(req),
    ).then(
        (result) => {
            workerScope.postMessage(result, transferOf(result));
        },
        (error: unknown) => {
            // A decode failure must reject its request, not hang the pool
            // slot until the timeout reaps the worker.
            workerScope.postMessage(
                {
                    kind: "error",
                    requestId: req.requestId,
                    message:
                        error instanceof Error
                            ? error.message
                            : String(error),
                },
                [],
            );
        },
    );
};

function transferOf(result: EngineResult): Transferable[] {
    if (result.kind === "error" || result.kind === "recolor") {
        return result.kind === "recolor" ? [result.colors.buffer] : [];
    }
    return [
        result.positions.buffer,
        result.colorsRgb.buffer,
        ...(result.colorsActive ? [result.colorsActive.buffer] : []),
        result.intensities.buffer,
        result.classifications.buffer,
    ];
}
