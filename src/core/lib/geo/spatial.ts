/**
 * Spatial calculation utilities — distance, perimeter and geometry
 * predicates. Pure functions, no dependencies.
 */
import type { Bbox2DTuple, Point2D } from "./types";

/** Mean Earth radius in meters (IUGG R1, the value turf also uses). */
const EARTH_RADIUS_M = 6371008.8;

/**
 * Great-circle distance between two [lng, lat] points in meters —
 * haversine on the mean Earth radius. Deviates from the true WGS84
 * ellipsoidal geodesic by up to ~0.5% (typically ~0.1%).
 */
export function greatCircleDistance(a: Point2D, b: Point2D): number {
    const lat1 = (a[1] * Math.PI) / 180;
    const lat2 = (b[1] * Math.PI) / 180;
    const dLat = lat2 - lat1;
    const dLon = ((b[0] - a[0]) * Math.PI) / 180;
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h =
        sinLat * sinLat +
        Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Check if a point is inside a polygon using ray casting.
 * @param candidate - [lng, lat] coordinates to test
 * @param polygon - array of [lng, lat] vertices; a single ring — holes
 *   are not modelled (does not need to be closed)
 * @returns true for interior points; points exactly on an edge or vertex
 *   are not reliably detected either way — callers must not lean on it
 */
export function isPointInPolygon(
    candidate: Point2D,
    polygon: Point2D[],
): boolean {
    const [px, py] = candidate;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i]!;
        const [xj, yj] = polygon[j]!;

        const intersect =
            yi > py !== yj > py &&
            px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}

/**
 * Compute the bounding box of a polygon.
 */
export function polygonBoundingBox(polygon: Point2D[]): Bbox2DTuple {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const [x, y] of polygon) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }

    return [minX, minY, maxX, maxY];
}

/**
 * Check if a point is inside a bounding box.
 * @param candidate - [lng, lat] coordinates
 * @param bbox - [minX, minY, maxX, maxY]
 */
export function isPointInBoundingBox(
    candidate: Point2D,
    bbox: Bbox2DTuple,
): boolean {
    const [x, y] = candidate;
    const [minX, minY, maxX, maxY] = bbox;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

/**
 * Perimeter of a polygon: the ring closes, so two points give the
 * there-and-back length and fewer than two give 0.
 */
export function polygonPerimeter(points: Point2D[]): number {
    if (points.length < 2) return 0;

    let perimeter = 0;
    for (let i = 1; i < points.length; i++) {
        perimeter += greatCircleDistance(points[i - 1]!, points[i]!);
    }
    const last = points[points.length - 1]!;
    const first = points[0]!;
    perimeter += greatCircleDistance(last, first);

    return perimeter;
}
