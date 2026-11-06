/**
 * Spatial calculation utilities — distance, perimeter and geometry
 * predicates. Pure functions, no dependencies.
 */

/** Mean Earth radius in meters (IUGG R1, the value turf also uses). */
const EARTH_RADIUS_M = 6371008.8;

/**
 * Great-circle distance between two [lng, lat] points in meters —
 * haversine on the mean Earth radius. Deviates from the true WGS84
 * ellipsoidal geodesic by up to ~0.5% (typically ~0.1%).
 */
export function greatCircleDistance(
    a: [number, number],
    b: [number, number],
): number {
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
        perimeter += greatCircleDistance(
            [prev.lng, prev.lat],
            [curr.lng, curr.lat],
        );
    }
    const last = points[points.length - 1]!;
    const first = points[0]!;
    perimeter += greatCircleDistance(
        [last.lng, last.lat],
        [first.lng, first.lat],
    );

    return perimeter;
}
