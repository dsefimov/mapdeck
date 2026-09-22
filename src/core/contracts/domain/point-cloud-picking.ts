/**
 * Shared picking utilities for point clouds.
 *
 * Generic over {@link PointCloudData} and the overlay's `pickObject` — no
 * COPC or deck.gl specifics, so any cloud protocol's data works (ADR-0012).
 */
import type { GeoPoint } from "@core/lib/geo";
import type { CloudPoint, PointCloudData } from "./point-cloud";

function hasRGB(
    data: PointCloudData,
): data is PointCloudData & { colors: Uint8Array } {
    return data.colors !== undefined;
}

function hasIntensity(
    data: PointCloudData,
): data is PointCloudData & { intensities: Float32Array } {
    return data.intensities !== undefined;
}

function hasClassification(
    data: PointCloudData,
): data is PointCloudData & { classifications: Uint8Array } {
    return data.classifications !== undefined;
}

/**
 * Minimal overlay manager interface for point picking.
 * Only exposes the pickObject method needed by pickPointFromCloud.
 */
interface PointPickingOverlay {
    pickObject(x: number, y: number, radius?: number): PickingInfo | null;
}

/** Screen-distance in px within which a deck pick counts as a hit. */
const PICK_RADIUS_PX = 20;

/** Options of {@link pickPointFromCloud}. */
export interface PickPointFromCloudOptions {
    screenX: number;
    screenY: number;
    overlayManager: PointPickingOverlay;
    getPointCloudData: (layerId: string) => PointCloudData | undefined;
    excludeLayerPrefix: string;
}

/** Options of {@link getPointWithFallback}. */
export interface GetPointWithFallbackOptions {
    screenX: number;
    screenY: number;
    eventLngLat: { lng: number; lat: number };
    overlayManager: PointPickingOverlay;
    getPointCloudData: (layerId: string) => PointCloudData | undefined;
    excludeLayerPrefix: string;
}

/**
 * Pick a point from point cloud at screen coordinates
 */
export function pickPointFromCloud(
    options: PickPointFromCloudOptions,
): CloudPoint | null {
    const { getPointCloudData } = options;

    const pickingInfo = pickValidPickedInfo(options);
    if (!pickingInfo) {
        return null;
    }

    const result = getPointFromPickingInfo(pickingInfo, getPointCloudData);
    return result ? toCloudPoint(result) : null;
}

/**
 * The picked info when it describes a usable hit: a layer with an id, a
 * point index, and a layer not excluded by `excludeLayerPrefix`.
 */
function pickValidPickedInfo(
    options: PickPointFromCloudOptions,
): PickingInfo | null {
    const { screenX, screenY, overlayManager, excludeLayerPrefix } = options;

    const pickingInfo = overlayManager.pickObject(
        screenX,
        screenY,
        PICK_RADIUS_PX,
    );
    if (!pickingInfo) {
        return null;
    }

    const validInfo = extractValidPickingInfo(pickingInfo);
    if (!validInfo || validInfo.mainLayerId.startsWith(excludeLayerPrefix)) {
        return null;
    }
    return pickingInfo;
}

/** Narrow a picking result to the plain cloud point (attributes dropped). */
function toCloudPoint(result: PickingResult): CloudPoint {
    return {
        lng: result.lng,
        lat: result.lat,
        z: result.z,
        layerId: result.layerId,
        pointIndex: result.pointIndex,
        coordinateOrigin: result.coordinateOrigin,
    };
}

/**
 * Get point from point cloud with fallback to surface coordinates
 */
export function getPointWithFallback(
    options: GetPointWithFallbackOptions,
): GeoPoint | null {
    const {
        screenX,
        screenY,
        eventLngLat,
        overlayManager,
        getPointCloudData,
        excludeLayerPrefix,
    } = options;

    const point = pickPointFromCloud({
        screenX,
        screenY,
        overlayManager,
        getPointCloudData,
        excludeLayerPrefix,
    });

    if (point) {
        return point;
    }

    return {
        lng: eventLngLat.lng,
        lat: eventLngLat.lat,
        z: 0,
    };
}

/**
 * Minimal picking info interface compatible with Deck.gl PickingInfo.
 * Contains only the fields needed for point extraction.
 * Properties can be undefined for compatibility with exactOptionalPropertyTypes.
 */
export interface PickingInfo {
    layer: { id: string } | null | undefined;
    coordinate?: number[] | [number, number, number] | null | undefined;
    index: number | null | undefined;
}

/**
 * Result of extracting a point from Deck.gl picking info.
 */
export interface PickingResult extends CloudPoint {
    /** Additional attributes extracted from the point */
    attributes: Record<string, unknown>;
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
    const r = cloudData.colors[base];
    const g = cloudData.colors[base + 1];
    const b = cloudData.colors[base + 2];
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
    return cloudData.intensities[pointIndex] ?? null;
}

/**
 * Extract classification code for a point from the classifications array.
 */
function extractClassificationFromPoint(
    cloudData: PointCloudData,
    pointIndex: number,
): number | null {
    if (!hasClassification(cloudData)) return null;
    return cloudData.classifications[pointIndex] ?? null;
}

/**
 * Validate and extract the core picking information from a Deck.gl PickingInfo.
 * The picked layer id is used as-is: every deck.gl layer is registered under
 * the map layer id, and the picking index already points into the layer's
 * contiguous render buffer.
 */
function extractValidPickingInfo(pickingInfo: PickingInfo): {
    mainLayerId: string;
    pointIndex: number;
} | null {
    const layerId = pickingInfo?.layer?.id;
    const pointIndex = pickingInfo?.index;

    if (!layerId || pointIndex === undefined || pointIndex === null) {
        return null;
    }

    return { mainLayerId: layerId, pointIndex };
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
 * @param pickingInfo - Deck.gl picking result
 * @param getPointCloudData - Callback to fetch loaded point cloud data by layer ID
 * @returns Extracted point with coordinates and attributes, or null if extraction failed
 */
export function getPointFromPickingInfo(
    pickingInfo: PickingInfo,
    getPointCloudData: (layerId: string) => PointCloudData | undefined,
): PickingResult | null {
    const validInfo = extractValidPickingInfo(pickingInfo);
    if (!validInfo) {
        return null;
    }
    const { mainLayerId, pointIndex } = validInfo;

    try {
        const cloudData = getPointCloudData(mainLayerId);
        if (!cloudData || !cloudData.positions) {
            return null;
        }

        if (!isValidPointIndex(pointIndex, cloudData.pointCount)) {
            return null;
        }

        let coords: [number, number, number] | null = null;
        if (pickingInfo.coordinate && pickingInfo.coordinate.length >= 3) {
            coords = pickingInfo.coordinate as [number, number, number];
        } else {
            coords = extractCoordinatesFromPositions(
                cloudData.positions,
                pointIndex,
                cloudData.coordinateOrigin,
            );
        }

        if (!coords) {
            return null;
        }

        const [lng, lat, z] = coords;
        const attributes = extractPointAttributes(cloudData, pointIndex);

        return {
            lng,
            lat,
            z,
            layerId: mainLayerId,
            pointIndex,
            coordinateOrigin: cloudData.coordinateOrigin,
            attributes,
        };
    } catch {
        // Best-effort by contract: a malformed picking payload or an
        // attribute-extraction failure means "no point here", and the
        // callers (feature collection, measure tools) already treat null
        // as a miss — surfacing it would turn every stray click into an
        // error toast.
        return null;
    }
}
