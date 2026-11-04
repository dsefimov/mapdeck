/**
 * Shared picking utilities for point clouds.
 *
 * Generic over {@link PointCloudData} and the overlay's `pickObject` — no
 * COPC or deck.gl specifics, so any cloud protocol's data works.
 */
import type { GeoPoint } from "@core/lib/geo";
import {
    stripPointCloudLayerSuffix,
    type CloudPoint,
    type PointCloudData,
} from "./point-cloud";

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
 * Exposes the pick methods needed by pickPointFromCloud; when the backend
 * serves a pick camera, depth-aware selection works without an explicit one.
 */
interface PointPickingOverlay {
    pickObject(x: number, y: number, radius?: number): PickingInfo | null;
    pickObjects(x: number, y: number, radius?: number): PickingInfo[];
    getPickCamera?(): PointPickingCamera | null;
}

/**
 * Camera for depth-aware picking: the eye position and world→common-space
 * projection, both in the same common space. The active deck.gl viewport
 * satisfies this structurally.
 */
export interface PointPickingCamera {
    readonly cameraPosition: readonly [number, number, number];
    projectPosition(coordinates: [number, number, number]): [
        number,
        number,
        number,
    ];
}

/** Screen-distance in px within which a deck pick counts as a hit. */
const PICK_RADIUS_PX = 8;

/** Options of {@link pickPointFromCloud}. */
export interface PickPointFromCloudOptions {
    screenX: number;
    screenY: number;
    overlayManager: PointPickingOverlay;
    getPointCloudData: (layerId: string) => PointCloudData | undefined;
    excludeLayerPrefix: string;
    camera?: PointPickingCamera | null | undefined;
}

/** Options of {@link getPointWithFallback}. */
export interface GetPointWithFallbackOptions {
    screenX: number;
    screenY: number;
    eventLngLat: { lng: number; lat: number };
    overlayManager: PointPickingOverlay;
    getPointCloudData: (layerId: string) => PointCloudData | undefined;
    excludeLayerPrefix: string;
    camera?: PointPickingCamera | null | undefined;
}

/**
 * Pick a point from point cloud at screen coordinates.
 *
 * With a camera (passed explicitly or served by the overlay backend) every
 * point rendered within {@link PICK_RADIUS_PX} of the cursor is a candidate,
 * and the one nearest to the camera wins — thin foreground geometry (a power
 * line) beats the dense surface behind it even when the cursor is slightly
 * off it. Without a camera, deck's single pick (closest to the cursor on
 * screen) is used.
 */
export function pickPointFromCloud(
    options: PickPointFromCloudOptions,
): CloudPoint | null {
    const camera =
        options.camera ?? options.overlayManager.getPickCamera?.() ?? null;
    const result = camera
        ? pickNearestToCamera(options, camera)
        : pickScreenClosest(options);
    return result ? toCloudPoint(result) : null;
}

/**
 * The picking result whose point is nearest to the camera among all valid
 * candidates in the pick radius; the first one on a tie.
 */
function pickNearestToCamera(
    options: PickPointFromCloudOptions,
    camera: PointPickingCamera,
): PickingResult | null {
    const {
        screenX,
        screenY,
        overlayManager,
        excludeLayerPrefix,
        getPointCloudData,
    } = options;
    const cameraPosition = camera.cameraPosition;

    let best: PickingResult | null = null;
    let bestDistanceSq = Infinity;

    const infos = overlayManager.pickObjects(
        screenX,
        screenY,
        PICK_RADIUS_PX,
    );
    for (const info of infos) {
        const candidate = extractPointCandidate(
            info,
            excludeLayerPrefix,
            getPointCloudData,
        );
        if (!candidate) {
            continue;
        }

        const projected = camera.projectPosition([
            candidate.lng,
            candidate.lat,
            candidate.z,
        ]);
        const dx = projected[0] - cameraPosition[0];
        const dy = projected[1] - cameraPosition[1];
        const dz = projected[2] - cameraPosition[2];
        const distanceSq = dx * dx + dy * dy + dz * dz;

        if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            best = candidate;
        }
    }
    return best;
}

/**
 * A valid candidate point (own layer, existing cloud data, index in range)
 * reconstructed from the picked buffer position — accurate lng/lat/z.
 */
function extractPointCandidate(
    pickingInfo: PickingInfo,
    excludeLayerPrefix: string,
    getPointCloudData: (layerId: string) => PointCloudData | undefined,
): PickingResult | null {
    const validInfo = extractValidPickingInfo(pickingInfo);
    if (!validInfo || validInfo.mainLayerId.startsWith(excludeLayerPrefix)) {
        return null;
    }
    const { mainLayerId, pointIndex } = validInfo;

    const cloudData = getPointCloudData(mainLayerId);
    if (!cloudData || !cloudData.positions) {
        return null;
    }
    if (!isValidPointIndex(pointIndex, cloudData.pointCount)) {
        return null;
    }

    const coords = extractCoordinatesFromPositions(
        cloudData.positions,
        pointIndex,
        cloudData.coordinateOrigin,
    );
    if (!coords) {
        return null;
    }

    return {
        lng: coords[0],
        lat: coords[1],
        z: coords[2],
        layerId: stripPointCloudLayerSuffix(mainLayerId),
        pointIndex,
        coordinateOrigin: cloudData.coordinateOrigin,
        attributes: extractPointAttributes(cloudData, pointIndex),
    };
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

/** Legacy single-pick path: the candidate closest to the cursor on screen. */
function pickScreenClosest(
    options: PickPointFromCloudOptions,
): PickingResult | null {
    const pickingInfo = pickValidPickedInfo(options);
    if (!pickingInfo) {
        return null;
    }
    return getPointFromPickingInfo(pickingInfo, options.getPointCloudData);
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
        camera,
    } = options;

    const point = pickPointFromCloud({
        screenX,
        screenY,
        overlayManager,
        getPointCloudData,
        excludeLayerPrefix,
        camera,
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
 * The picked layer id is used as-is: a protocol may serve several deck layers
 * per tree layer, and the picking index points into the picked one's buffer.
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
            layerId: stripPointCloudLayerSuffix(mainLayerId),
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
