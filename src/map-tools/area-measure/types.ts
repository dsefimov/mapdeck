/**
 * Types for Area Measure tool
 */

import type { GeoPoint } from "@core/lib/geo";

/**
 * Segment between two consecutive vertices with edge distance
 */
export interface PolygonEdge {
    from: GeoPoint;
    to: GeoPoint;
    distanceMeters: number; // geodesic distance in meters
}

/**
 * Computed measurements for a polygon
 */
export interface AreaMeasurements {
    /** Area in square meters (2D projection) */
    areaSquareMeters: number;
    /** Perimeter in meters (sum of edge distances) */
    perimeterMeters: number;
    /** Individual edges with distances */
    edges: PolygonEdge[];
    /** Number of vertices */
    vertexCount: number;
}
