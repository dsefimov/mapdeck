import proj4 from "proj4";
import { Copc } from "copc";
import type { Copc as CopcType, Getter } from "copc";

import { Bbox, type BBox3D } from "@core/lib/geo";
import type { StreamingSource } from "../../types";

import { resolveUrl, createBufferGetter } from "./resolveSource";
import { clampLatLng } from "../geometry/wgs84";
import { extractProjcsFromWkt } from "../geometry/crs";
import { metersPerDegreeAt } from "../geometry/geoMath";

/**
 * Result of COPC initialization — everything needed for streaming operation.
 */
export interface CopcInitResult {
    bounds: BBox3D;
    coordinateOrigin: [number, number, number];
    totalPoints: number;
    spacing: number;
    spacingMeters: number;
    hasColor: boolean;
    wkt: string | null;
    /** Octree cube in source CRS (needed for rootSpacing computation). */
    octreeCube: [number, number, number, number, number, number];
    /** Root hierarchy page for hierarchy tracker initialization. */
    rootHierarchyPage: CopcType["info"]["rootHierarchyPage"];
}

/**
 * Opens a COPC source (URL, File, or ArrayBuffer) and returns a Copc instance.
 * Throws descriptive errors on failure.
 */
export async function openCopcSource(
    source: StreamingSource,
): Promise<{ copc: CopcType; resolvedSource: string | Getter }> {
    if (typeof source === "string") {
        const url = resolveUrl(source.trim());
        if (!url) throw new Error("CopcStreamingLoader: Source URL is empty");
        let copc: CopcType;
        try {
            copc = await Copc.create(url);
        } catch (error: unknown) {
            throw resolveUrlError(error);
        }
        return { copc, resolvedSource: url };
    }

    if (source instanceof File) {
        const buffer = await source.arrayBuffer();
        const getter = createBufferGetter(buffer);
        return openCopcFromGetter(getter, "File");
    }

    if (source instanceof ArrayBuffer) {
        const getter = createBufferGetter(source);
        return openCopcFromGetter(getter, "ArrayBuffer");
    }

    throw new Error(
        `CopcStreamingLoader: Unsupported source type: ${typeof source}. ` +
            `Expected string (URL), File, or ArrayBuffer.`,
    );
}

/** Shared opener for buffer-based sources. */
async function openCopcFromGetter(
    getter: Getter,
    ctx: string,
): Promise<{ copc: CopcType; resolvedSource: Getter }> {
    try {
        return { copc: await Copc.create(getter), resolvedSource: getter };
    } catch (error: unknown) {
        throw new Error(
            `CopcStreamingLoader: Failed to create Copc instance from ${ctx}: ` +
                `${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/** Translate common URL errors into actionable messages. */
function resolveUrlError(error: unknown): Error {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
        return new Error(
            `CopcStreamingLoader: Failed to fetch from URL (CORS error). ` +
                `Solutions: (1) Download file locally, (2) Use CORS proxy, (3) Host on CORS-enabled server. ` +
                `Original error: ${error.message}`,
        );
    }
    if (error instanceof Error && error.message.includes("access")) {
        return new Error(
            `CopcStreamingLoader: Invalid COPC file or URL. The file may not be a valid COPC.LAZ format. ` +
                `Original error: ${error.message}`,
        );
    }
    return new Error(
        `CopcStreamingLoader: Failed to create Copc instance: ` +
            `${error instanceof Error ? error.message : String(error)}`,
    );
}

/**
 * Extracts metadata from CopcType instance.
 * Pure function — reads fields, no mutation.
 */
export function extractCopcMeta(copc: CopcType): {
    rootHierarchyPage: CopcType["info"]["rootHierarchyPage"];
    spacing: number;
    totalPoints: number;
    octreeCube: [number, number, number, number, number, number];
    hasColor: boolean;
} {
    const { header, info } = copc;
    const colorFormats = [2, 3, 5, 7, 8, 10];
    return {
        rootHierarchyPage: info.rootHierarchyPage,
        spacing: info.spacing,
        totalPoints: header.pointCount,
        octreeCube: info.cube as [
            number,
            number,
            number,
            number,
            number,
            number,
        ],
        hasColor: colorFormats.includes(header.pointDataRecordFormat),
    };
}

/**
 * Builds a proj4 transformer from a WKT string.
 * Throws if WKT is absent or unsupported.
 */
export function buildCrsTransformer(
    wkt: string,
): (coord: [number, number]) => [number, number] {
    const wktToUse = extractProjcsFromWkt(wkt);
    if (!proj4.defs("EPSG:4326")) {
        proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
    }
    const converter = proj4(wktToUse, "EPSG:4326");
    return (coord: [number, number]) =>
        converter.forward(coord) as [number, number];
}

/** Interior divisions per edge when re-projecting the source extent. */
const OUTLINE_SEGMENTS = 8;

/**
 * Walk the outline of an axis-aligned rectangle, sampling each edge.
 *
 * Two opposite corners describe the rectangle only in its own CRS. A map
 * projection bends straight lines, so the re-projected extent reaches its
 * extremes anywhere along the outline — most of it at the two corners the
 * header never names, the rest on the bulge between them.
 */
function sampleRectangleOutline(
    min: readonly [number, number],
    max: readonly [number, number],
): [number, number][] {
    const at = (from: number, to: number, step: number): number =>
        from + ((to - from) * step) / OUTLINE_SEGMENTS;

    return Array.from({ length: OUTLINE_SEGMENTS + 1 }, (_, step) => [
        [at(min[0], max[0], step), min[1]],
        [at(min[0], max[0], step), max[1]],
        [min[0], at(min[1], max[1], step)],
        [max[0], at(min[1], max[1], step)],
    ] as [number, number][]).flat();
}

/**
 * Computes WGS84 bounds from a COPC header, applying the transformer when the
 * source is not already geographic. The whole extent outline is projected, not
 * just the header's two corners — see `sampleRectangleOutline`.
 */
export function computeWgs84Bounds(
    header: CopcType["header"],
    transformer: ((coord: [number, number]) => [number, number]) | null,
): BBox3D {
    const outline = sampleRectangleOutline(
        [header.min[0], header.min[1]],
        [header.max[0], header.max[1]],
    ).map((point) => clampLatLng(...(transformer ? transformer(point) : point)));

    return Bbox.fromCorners({
        minX: Math.min(...outline.map((p) => p[0])),
        minY: Math.min(...outline.map((p) => p[1])),
        minZ: header.min[2],
        maxX: Math.max(...outline.map((p) => p[0])),
        maxY: Math.max(...outline.map((p) => p[1])),
        maxZ: header.max[2],
    });
}

/**
 * Computes coordinate origin — center of the bounding box.
 */
export function computeCoordinateOrigin(
    bounds: BBox3D,
): [number, number, number] {
    return [
        (bounds.minX + bounds.maxX) / 2,
        (bounds.minY + bounds.maxY) / 2,
        0,
    ];
}

/**
 * Computes spacing in meters.
 * For WGS84 data (needsTransform === false), converts degrees to meters.
 */
export function computeSpacingMeters(
    spacingDegrees: number,
    bounds: BBox3D,
    needsTransform: boolean,
): number {
    if (!needsTransform && spacingDegrees > 0) {
        const centerLat = (bounds.minY + bounds.maxY) / 2;
        const metersPerDegreeLng = metersPerDegreeAt(centerLat);
        return spacingDegrees * metersPerDegreeLng;
    }
    return spacingDegrees;
}

/** Outcome of the full initialization pipeline, consumed by the streaming loader. */
export interface CopcInit {
    copc: CopcType;
    resolvedSource: string | Getter;
    meta: CopcInitResult;
    transformer: ((coord: [number, number]) => [number, number]) | null;
    needsTransform: boolean;
}

/** CRS setup outcome: the forward transformer and whether the source needs it. */
interface CrsSetup {
    transformer: ((coord: [number, number]) => [number, number]) | null;
    needsTransform: boolean;
}

/**
 * Set up the source→WGS84 transformer from the file's WKT. A present-but-
 * unsupported WKT is fatal: silently skipping it would place the cloud in
 * the wrong location rather than fail the load.
 */
function setupCrsTransformer(wkt: string | null | undefined): CrsSetup {
    if (!wkt) {
        return { transformer: null, needsTransform: false };
    }
    try {
        return { transformer: buildCrsTransformer(wkt), needsTransform: true };
    } catch (e: unknown) {
        throw new Error(
            `CopcStreamingLoader: Failed to setup coordinate transformation from WKT: ` +
                `${e instanceof Error ? e.message : String(e)}. ` +
                `Ensure the WKT string in the COPC file is valid and supported by proj4.`,
        );
    }
}

/**
 * Assemble the durable init metadata: raw header extraction plus the geo
 * values derived from the (possibly transformed) bounds.
 */
function assembleInitMeta(
    rawMeta: ReturnType<typeof extractCopcMeta>,
    copc: CopcType,
    bounds: BBox3D,
    needsTransform: boolean,
): CopcInitResult {
    return {
        bounds,
        coordinateOrigin: computeCoordinateOrigin(bounds),
        totalPoints: rawMeta.totalPoints,
        spacing: rawMeta.spacing,
        spacingMeters: computeSpacingMeters(rawMeta.spacing, bounds, needsTransform),
        hasColor: rawMeta.hasColor,
        wkt: copc.wkt ?? null,
        octreeCube: rawMeta.octreeCube,
        rootHierarchyPage: rawMeta.rootHierarchyPage,
    };
}

/**
 * Full initialization pipeline.
 * Orchestrates: open source → extract metadata → setup CRS → compute bounds/origin/spacing.
 */
export async function initCopc(source: StreamingSource): Promise<CopcInit> {
    const { copc, resolvedSource } = await openCopcSource(source);
    const { transformer, needsTransform } = setupCrsTransformer(copc.wkt);

    const bounds = computeWgs84Bounds(copc.header, transformer);
    const meta = assembleInitMeta(
        extractCopcMeta(copc),
        copc,
        bounds,
        needsTransform,
    );

    return {
        copc,
        resolvedSource,
        meta,
        transformer,
        needsTransform,
    };
}
