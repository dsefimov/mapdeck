/**
 * Types for 3D Ruler tool
 */

import type { GeoPoint } from "@core/lib/geo";

/**
 * Segment between two points with calculated distances
 */
export interface SegmentDistance3D {
    from: GeoPoint;
    to: GeoPoint;
    distanceMeters: number; // full 3D Euclidean distance
    horizontalDistance: number; // horizontal distance in meters
    verticalDistance: number; // vertical distance in meters
}
