/**
 * 2D Delaunay triangulation, delegated to `delaunator` (O(n log n),
 * robust to duplicates and collinear input) behind a plain PointXY/Triangle
 * interface — cloud-scale sets (tens of thousands of points) triangulate in
 * milliseconds, which the previous in-house O(n²) implementation could not.
 */

import Delaunator from "delaunator";

/**
 * 2D point for triangulation (planar Cartesian coordinates).
 * Uses {x, y} shape, distinct from geo Point2D = [number, number].
 */
export interface PointXY {
    x: number;
    y: number;
}

export interface Triangle {
    a: number;
    b: number;
    c: number;
}

/**
 * Perform 2D Delaunay triangulation on a set of points.
 * Returns an array of triangles (each triangle has 3 indices into the
 * points array). Fewer than three points, and fully collinear input,
 * yield no triangles; duplicate points are tolerated.
 */
export function delaunayTriangulate(points: PointXY[]): Triangle[] {
    if (points.length < 3) return [];

    const coords = new Float64Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
        coords[i * 2] = points[i]!.x;
        coords[i * 2 + 1] = points[i]!.y;
    }

    const { triangles } = new Delaunator(coords);
    const result: Triangle[] = [];
    for (let i = 0; i < triangles.length; i += 3) {
        result.push({
            a: triangles[i]!,
            b: triangles[i + 1]!,
            c: triangles[i + 2]!,
        });
    }
    return result;
}
