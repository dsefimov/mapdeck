import proj4 from "proj4";
import { Copc } from "copc";
import type { Copc as CopcType, Getter } from "copc";

import type { StreamingSource, BBox3D } from "@core/framework/types";

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
            throw resolveUrlError(error, url);
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
function resolveUrlError(error: unknown, _url: string): Error {
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

/**
 * Computes WGS84 bounds from COPC header.
 * Applies transformer when needsTransform is true.
 */
export function computeWgs84Bounds(
    header: CopcType["header"],
    transformer: ((coord: [number, number]) => [number, number]) | null,
): BBox3D {
    let sw: [number, number] = [header.min[0], header.min[1]];
    let ne: [number, number] = [header.max[0], header.max[1]];

    if (transformer) {
        sw = transformer(sw);
        ne = transformer(ne);
    }

    const [minLng, minLat] = clampLatLng(...sw);
    const [maxLng, maxLat] = clampLatLng(...ne);

    return {
        minX: Math.min(minLng, maxLng),
        minY: Math.min(minLat, maxLat),
        minZ: header.min[2],
        maxX: Math.max(minLng, maxLng),
        maxY: Math.max(minLat, maxLat),
        maxZ: header.max[2],
    };
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

/**
 * Full initialization pipeline.
 * Orchestrates: open source → extract metadata → setup CRS → compute bounds/origin/spacing.
 */
export async function initCopc(source: StreamingSource): Promise<{
    copc: CopcType;
    resolvedSource: string | Getter;
    meta: CopcInitResult;
    transformer: ((coord: [number, number]) => [number, number]) | null;
    needsTransform: boolean;
}> {
    const { copc, resolvedSource } = await openCopcSource(source);
    const meta_raw = extractCopcMeta(copc);

    let transformer: ((coord: [number, number]) => [number, number]) | null =
        null;
    let needsTransform = false;

    if (copc.wkt) {
        try {
            transformer = buildCrsTransformer(copc.wkt);
            needsTransform = true;
        } catch (e: unknown) {
            throw new Error(
                `CopcStreamingLoader: Failed to setup coordinate transformation from WKT: ` +
                    `${e instanceof Error ? e.message : String(e)}. ` +
                    `Ensure the WKT string in the COPC file is valid and supported by proj4.`,
            );
        }
    }

    const bounds = computeWgs84Bounds(copc.header, transformer);
    const coordinateOrigin = computeCoordinateOrigin(bounds);
    const spacingMeters = computeSpacingMeters(
        meta_raw.spacing,
        bounds,
        needsTransform,
    );

    const meta: CopcInitResult = {
        bounds,
        coordinateOrigin,
        totalPoints: meta_raw.totalPoints,
        spacing: meta_raw.spacing,
        spacingMeters,
        hasColor: meta_raw.hasColor,
        wkt: copc.wkt ?? null,
        octreeCube: meta_raw.octreeCube,
        rootHierarchyPage: meta_raw.rootHierarchyPage,
    };

    return {
        copc,
        resolvedSource,
        meta,
        transformer,
        needsTransform,
    };
}
