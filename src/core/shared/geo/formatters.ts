/**
 * Shared geo formatters and data converters.
 * Pure functions used by measurement tools (ruler-3d, area-measure, volume-measure).
 */
import type { MeasurementPoint3D } from "@core/framework/types";

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
