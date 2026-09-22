/**
 * Shared geo formatters and data converters.
 * Pure functions for human-readable distance/area/volume output.
 */
import type { GeoPoint } from "./types";

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
 * Format volume in cubic meters to human-readable string.
 */
export function formatVolume(cubicMeters: number): string {
    if (cubicMeters >= 1_000_000) {
        return `${(cubicMeters / 1_000_000).toFixed(3)} km³`;
    }
    if (cubicMeters >= 1) {
        return `${cubicMeters.toFixed(2)} m³`;
    }
    if (cubicMeters >= 0.001) {
        return `${(cubicMeters * 1000).toFixed(1)} litres`;
    }
    return `${(cubicMeters * 1_000_000).toFixed(1)} ml`;
}

/**
 * Convert GeoPoint to a planar [lng, lat, z] tuple.
 */
export function convertPointToDegrees(
    point: GeoPoint,
): [number, number, number] {
    return [point.lng, point.lat, point.z];
}
