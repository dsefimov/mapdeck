/**
 * Shared picking utilities for Deck.gl point cloud picking.
 * Extracted from ruler-3d/coordinates.ts for reuse across map tools.
 */
import { logger } from "@core/shared/diagnostics/logger";
import { layerAdapterFactory, PointCloudAdapter } from "@core/domain/adapters";
import { LayerRoles } from "@core/framework/types";
import type { PointCloudData } from "@core/framework/types";
import { hasRGB, hasIntensity, hasClassification } from "@core/framework/types";

const CHUNK_MULTIPLIER = 1_000_000;

/**
 * Minimal picking info interface compatible with Deck.gl PickingInfo.
 * Contains only the fields needed for point extraction.
 * Properties can be undefined for compatibility with exactOptionalPropertyTypes.
 */
export interface PickingInfo {
    layer: { id: string } | null | undefined;
    coordinate: number[] | [number, number, number] | null | undefined;
    index: number | null | undefined;
}

/**
 * Result of extracting a point from Deck.gl picking info.
 */
export interface PickingResult {
    /** Longitude in degrees */
    lng: number;
    /** Latitude in degrees */
    lat: number;
    /** Elevation (meters or units from source) */
    z: number;
    /** Layer ID the point belongs to */
    layerId: string;
    /** Global point index within the layer */
    pointIndex: number;
    /** Coordinate origin used for offset calculation */
    coordinateOrigin: [number, number, number];
    /** Additional attributes extracted from the point */
    attributes: Record<string, unknown>;
}

/**
 * Parse a potentially chunked layer ID to extract the main layer ID and chunk index.
 * Chunked IDs follow the pattern: `{mainLayerId}-chunk{index}`
 */
export function parseChunkInfo(layerId: string): {
    mainLayerId: string;
    chunkIndex: number | null;
} {
    const regex = /^(.*)-chunk(\d+)$/;
    const match = regex.exec(layerId);
    if (match) {
        const mainLayerId = match[1]!;
        const chunkIndex = parseInt(match[2]!, 10);
        return { mainLayerId, chunkIndex };
    }
    return { mainLayerId: layerId, chunkIndex: null };
}

/**
 * Calculate the global point index from a local index and optional chunk index.
 */
function calculateGlobalIndex(
    pointIndex: number,
    chunkIndex: number | null,
): number {
    return chunkIndex !== null
        ? chunkIndex * CHUNK_MULTIPLIER + pointIndex
        : pointIndex;
}

/**
 * Check if a point index is valid for the given point count.
 */
function isValidPointIndex(index: number, pointCount: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < pointCount;
}

/**
 * Extract coordinates from a positions array at the given index.
 * Positions are offsets from the coordinate origin.
 */
function extractCoordinatesFromPositions(
    positions: Float32Array | number[],
    index: number,
    origin: [number, number, number],
): [number, number, number] | null {
    const base = index * 3;
    const ox = positions[base];
    const oy = positions[base + 1];
    const oz = positions[base + 2];

    if (ox === undefined || oy === undefined || oz === undefined) {
        return null;
    }

    return [origin[0] + ox, origin[1] + oy, origin[2] + oz];
}

/**
 * Extract color values (R, G, B) for a point from the colors array.
 */
function extractColorFromPoint(
    cloudData: PointCloudData,
    pointIndex: number,
): [number, number, number] | null {
    if (!hasRGB(cloudData)) return null;
    const base = pointIndex * 4; // RGBA
    const r = cloudData.colors![base];
    const g = cloudData.colors![base + 1];
    const b = cloudData.colors![base + 2];
    if (r === undefined || g === undefined || b === undefined) return null;
    return [r, g, b];
}

/**
 * Extract intensity value for a point from the intensities array.
 */
function extractIntensityFromPoint(
    cloudData: PointCloudData,
    pointIndex: number,
): number | null {
    if (!hasIntensity(cloudData)) return null;
    return cloudData.intensities![pointIndex] ?? null;
}

/**
 * Extract classification code for a point from the classifications array.
 */
function extractClassificationFromPoint(
    cloudData: PointCloudData,
    pointIndex: number,
): number | null {
    if (!hasClassification(cloudData)) return null;
    return cloudData.classifications![pointIndex] ?? null;
}

/**
 * Get loaded point cloud data for a layer ID from the PointCloudAdapter.
 */
function getCloudData(layerId: string): PointCloudData | null {
    const adapter = layerAdapterFactory.get(LayerRoles.POINT_CLOUD) as
        | PointCloudAdapter
        | undefined;
    if (!adapter) return null;

    const data = adapter.getLoadedData?.(layerId);
    return data && (data as PointCloudData).positions
        ? (data as PointCloudData)
        : null;
}

/**
 * Validate and extract the core picking information from a Deck.gl PickingInfo.
 */
function extractValidPickingInfo(pickingInfo: PickingInfo): {
    mainLayerId: string;
    chunkIndex: number | null;
    pointIndex: number;
} | null {
    const layerId = pickingInfo?.layer?.id;
    const pointIndex = pickingInfo?.index;

    if (!layerId || pointIndex === undefined || pointIndex === null) {
        return null;
    }

    const { mainLayerId, chunkIndex } = parseChunkInfo(layerId);
    return { mainLayerId, chunkIndex, pointIndex };
}

/**
 * Extract all available attributes from a picked point.
 */
function extractPointAttributes(
    cloudData: PointCloudData,
    pointIndex: number,
): Record<string, unknown> {
    const attrs: Record<string, unknown> = {};

    const color = extractColorFromPoint(cloudData, pointIndex);
    if (color) {
        attrs.color = color;
    }

    const intensity = extractIntensityFromPoint(cloudData, pointIndex);
    if (intensity !== null) {
        attrs.intensity = intensity;
    }

    const classification = extractClassificationFromPoint(
        cloudData,
        pointIndex,
    );
    if (classification !== null) {
        attrs.classification = classification;
    }

    return attrs;
}

/**
 * Extract a point with coordinates and attributes from Deck.gl PickingInfo.
 *
 * This is a pure function that depends only on:
 * - The picking info from Deck.gl
 * - The loaded point cloud data via layerAdapterFactory
 *
 * @param pickingInfo - Deck.gl picking result
 * @returns Extracted point with coordinates and attributes, or null if extraction failed
 */
export function getPointFromPickingInfo(
    pickingInfo: PickingInfo,
): PickingResult | null {
    const validInfo = extractValidPickingInfo(pickingInfo);
    if (!validInfo) {
        return null;
    }
    const { mainLayerId, chunkIndex, pointIndex } = validInfo;

    try {
        const cloudData = getCloudData(mainLayerId);
        if (!cloudData) {
            logger.warn(`picking: No loaded data for layer: ${mainLayerId}`);
            return null;
        }

        const globalPointIndex = calculateGlobalIndex(pointIndex, chunkIndex);
        if (!isValidPointIndex(globalPointIndex, cloudData.pointCount)) {
            logger.warn(
                `picking: Invalid point index ${globalPointIndex} for layer ${mainLayerId}`,
            );
            return null;
        }

        // Get coordinates: prefer pickingInfo.coordinate, fallback to positions array
        let coords: [number, number, number] | null = null;
        if (pickingInfo.coordinate && pickingInfo.coordinate.length >= 3) {
            coords = pickingInfo.coordinate as [number, number, number];
        } else {
            coords = extractCoordinatesFromPositions(
                cloudData.positions,
                globalPointIndex,
                cloudData.coordinateOrigin,
            );
        }

        if (!coords) {
            logger.warn(
                `picking: Failed to get coordinates for point ${globalPointIndex}`,
            );
            return null;
        }

        const [lng, lat, z] = coords;
        const attributes = extractPointAttributes(cloudData, globalPointIndex);

        return {
            lng,
            lat,
            z,
            layerId: mainLayerId,
            pointIndex: globalPointIndex,
            coordinateOrigin: cloudData.coordinateOrigin,
            attributes,
        };
    } catch (error) {
        logger.error("picking: Failed to get point from picking info", error);
        return null;
    }
}
