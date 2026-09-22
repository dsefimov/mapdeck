/**
 * Pure measurement math for the 3D ruler: per-segment horizontal,
 * vertical and Euclidean distances over a drawn polyline.
 */
import { geodesicDistance } from "@core/lib/geo";
import type { GeoPoint } from "@core/lib/geo";
import type { SegmentDistance3D } from "../types";

/** 3D distance from a precomputed ground track and vertical delta. */
function euclideanFromComponents(
    horizontal: number,
    vertical: number,
): number {
    return Math.sqrt(horizontal * horizontal + vertical * vertical);
}

/** Full 3D distance: geodesic ground track combined with height delta. */
export function euclidean3D(p1: GeoPoint, p2: GeoPoint): number {
    return euclideanFromComponents(
        geodesicDistance([p1.lng, p1.lat], [p2.lng, p2.lat]),
        Math.abs(p2.z - p1.z),
    );
}

export interface Polyline3DMeasurements {
    segments: SegmentDistance3D[];
    totalDistance: number;
    totalHorizontal: number;
    totalVertical: number;
}

/** Measure the polyline drawn so far — safe on any prefix of vertices. */
export function measurePolyline3D(points: GeoPoint[]): Polyline3DMeasurements {
    const segments: SegmentDistance3D[] = [];
    for (let i = 1; i < points.length; i++) {
        const from = points[i - 1];
        const to = points[i];
        if (!from || !to) continue;
        // One geodesic per segment feeds both the horizontal and the 3D distance.
        const horizontal = geodesicDistance(
            [from.lng, from.lat],
            [to.lng, to.lat],
        );
        const vertical = Math.abs(to.z - from.z);
        segments.push({
            from,
            to,
            distanceMeters: euclideanFromComponents(horizontal, vertical),
            horizontalDistance: horizontal,
            verticalDistance: vertical,
        });
    }
    return {
        segments,
        totalDistance: segments.reduce((s, seg) => s + seg.distanceMeters, 0),
        totalHorizontal: segments.reduce(
            (s, seg) => s + seg.horizontalDistance,
            0,
        ),
        totalVertical: segments.reduce((s, seg) => s + seg.verticalDistance, 0),
    };
}
