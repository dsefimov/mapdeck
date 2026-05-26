/**
 * Shared measurement utilities for map tools.
 * Used by ruler-3d, area-measure, and other measurement tools.
 */
import { overlayManager } from "@core/domain/overlay";
import { logger } from "@core/shared/diagnostics/logger";
import {
    getPointFromPickingInfo as getPointFromPickingInfoCore,
    type PickingInfo as PickingInfoCore,
} from "@core/domain/overlay/picking";
import type { LayerAdapterFactory } from "@core/domain/adapters";
import type { MeasurementPoint3D } from "@core/framework/types";

// Prefix for tool-generated layer IDs (used for filtering during picking)
const TOOL_LAYER_PREFIX = "ruler-3d-";

interface PickPointFromCloudOptions {
    screenX: number;
    screenY: number;
    adapterFactory: LayerAdapterFactory;
    excludeLayerPrefix: string;
}

/**
 * Pick a point from point cloud at screen coordinates
 */
export function pickPointFromCloud(
    options: PickPointFromCloudOptions,
): MeasurementPoint3D | null {
    const { screenX, screenY, adapterFactory, excludeLayerPrefix } = options;
    if (typeof overlayManager.pickObject !== "function") {
        logger.warn(
            "measurements: pickObject method not available on overlayManager",
        );
        return null;
    }

    const pickingInfo = overlayManager.pickObject(screenX, screenY, 20);

    if (!pickingInfo) {
        return null;
    }

    const layer = pickingInfo.layer;
    if (!layer || !layer.id) {
        return null;
    }

    // Ignore tool's own layers
    if (layer.id.startsWith(excludeLayerPrefix)) {
        return null;
    }

    if (pickingInfo.index == null) {
        return null;
    }

    const result = getPointFromPickingInfoCore(
        pickingInfo as PickingInfoCore,
        adapterFactory,
    );
    if (!result) {
        return null;
    }

    return {
        lng: result.lng,
        lat: result.lat,
        z: result.z,
        layerId: result.layerId,
        pointIndex: result.pointIndex,
        coordinateOrigin: result.coordinateOrigin,
    };
}

interface GetPointWithFallbackOptions {
    screenX: number;
    screenY: number;
    eventLngLat: { lng: number; lat: number };
    adapterFactory: LayerAdapterFactory;
    excludeLayerPrefix?: string;
}

/**
 * Get point from point cloud with fallback to surface coordinates
 */
export function getPointWithFallback(
    options: GetPointWithFallbackOptions,
): MeasurementPoint3D | null {
    const {
        screenX,
        screenY,
        eventLngLat,
        adapterFactory,
        excludeLayerPrefix,
    } = options;

    const point = pickPointFromCloud({
        screenX,
        screenY,
        adapterFactory,
        excludeLayerPrefix: excludeLayerPrefix ?? TOOL_LAYER_PREFIX,
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
 * Format distance in meters to human-readable string
 */
export function formatDistance(meters: number): string {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(2)} km`;
    }
    if (meters >= 1) {
        return `${meters.toFixed(2)} m`;
    }
    return `${(meters * 100).toFixed(1)} cm`;
}

/**
 * Format area in square meters to human-readable string
 */
export function formatArea(squareMeters: number): string {
    if (squareMeters >= 1_000_000) {
        return `${(squareMeters / 1_000_000).toFixed(3)} km²`;
    }
    if (squareMeters >= 10_000) {
        return `${(squareMeters / 10_000).toFixed(2)} ha`;
    }
    if (squareMeters >= 1) {
        return `${squareMeters.toFixed(2)} m²`;
    }
    return `${(squareMeters * 10000).toFixed(1)} cm²`;
}

/**
 * Convert MeasurementPoint3D to [lng, lat, z] array for Deck.gl layers
 */
export function convertPointToDegrees(
    point: MeasurementPoint3D,
): [number, number, number] {
    return [point.lng, point.lat, point.z];
}
