/**
 * Spatial calculation utilities — Turf wrappers + geometry predicates.
 * Pure functions for geodesic distance, perimeter, and point-in-polygon tests.
 */

import distance from "@turf/distance";
import { point } from "@turf/helpers";

/**
 * Check if a point is inside a polygon using ray casting.
 * @param candidate - [x, y] coordinates to test
 * @param polygon - array of [x, y] vertices (does not need to be closed)
 * @returns true for interior points; points exactly on an edge or vertex
 *   are not reliably detected either way — callers must not lean on it
 */
export function isPointInPolygon(
    candidate: [number, number],
    polygon: [number, number][],
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
 * Returns [minX, minY, maxX, maxY].
 */
export function polygonBoundingBox(
    polygon: [number, number][],
): [number, number, number, number] {
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
 * @param candidate - [x, y] coordinates
 * @param bbox - [minX, minY, maxX, maxY]
 */
export function isPointInBoundingBox(
    candidate: [number, number],
    bbox: [number, number, number, number],
): boolean {
    const [x, y] = candidate;
    const [minX, minY, maxX, maxY] = bbox;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

/**
 * Calculate the geodesic distance between two points in meters.
 */
export function geodesicDistance(
    a: [number, number],
    b: [number, number],
): number {
    return distance(point(a), point(b), { units: "meters" });
}

/**
 * Calculate the perimeter of a polygon defined by an array of points.
 */
export function calculatePolygonPerimeter(
    points: { lng: number; lat: number }[],
): number {
    if (points.length < 2) return 0;

    let perimeter = 0;
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]!;
        const curr = points[i]!;
        perimeter += geodesicDistance(
            [prev.lng, prev.lat],
            [curr.lng, curr.lat],
        );
    }
    const last = points[points.length - 1]!;
    const first = points[0]!;
    perimeter += geodesicDistance([last.lng, last.lat], [first.lng, first.lat]);

    return perimeter;
}
