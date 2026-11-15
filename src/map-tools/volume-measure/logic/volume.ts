import type { GeoPoint, LocalMetricFrame } from "@core/lib/geo";
import type { PointCloudData } from "@core/contracts";
import type { MetricPoint } from "./volume-engine";
import {
    projectMeasurementSite,
    trianglesInsideBoundary,
} from "./volume-engine";
import {
    isPointInBoundingBox,
    isPointInPolygon,
    polygonBoundingBox,
} from "@core/lib/geo";

/**
 * Upper bound on cloud points fed into the volume computation —
 * beyond it the set is evenly thinned. The pre-thinning count travels
 * alongside so the UI can report "used / found".
 */
export const MAX_VOLUME_CLOUD_POINTS = 50_000;

/** Aggregated output of one completed measurement. */
export interface VolumeMeasurements {
    fillCubicMeters: number;
    cutCubicMeters: number;
    surfaceAreaSquareMeters: number;
    baseZMin: number;
    baseZMax: number;
    surfaceZMin: number;
    surfaceZMax: number;
    /** Points actually used by the computation (post-thinning). */
    cloudPointCount: number;
    triangleCount: number;
}

export const EMPTY_VOLUME_MEASUREMENTS: VolumeMeasurements = {
    fillCubicMeters: 0,
    cutCubicMeters: 0,
    surfaceAreaSquareMeters: 0,
    baseZMin: 0,
    baseZMax: 0,
    surfaceZMin: 0,
    surfaceZMax: 0,
    cloudPointCount: 0,
    triangleCount: 0,
};

/** Evenly thinned point set with the count it originated from. */
export interface ThinnedPoints {
    points: GeoPoint[];
    foundCount: number;
}

/**
 * Caps the set at `max` samples by even stride. Below the cap the set
 * passes through untouched.
 */
export function thinPoints(points: GeoPoint[], max: number): ThinnedPoints {
    if (points.length <= max) {
        return { points, foundCount: points.length };
    }
    const step = Math.ceil(points.length / max);
    return {
        points: points.filter((_, i) => i % step === 0),
        foundCount: points.length,
    };
}

/** Keeps the points that fall inside the boundary polygon (bbox pre-filter). */
export function filterPointsInsidePolygon(
    boundary: GeoPoint[],
    allCloudPoints: GeoPoint[],
): GeoPoint[] {
    if (boundary.length < 3) return [];
    const polygon2D: [number, number][] = boundary.map((p) => [p.lng, p.lat]);
    const bbox = polygonBoundingBox(polygon2D);
    const result: GeoPoint[] = [];
    for (const pt of allCloudPoints) {
        const pair: [number, number] = [pt.lng, pt.lat];
        if (
            isPointInBoundingBox(pair, bbox) &&
            isPointInPolygon(pair, polygon2D)
        ) {
            result.push(pt);
        }
    }
    return result;
}

/** Unpacks relative render positions back into absolute GeoPoints. */
export function extractPointsFromCloudData(data: PointCloudData): GeoPoint[] {
    const points: GeoPoint[] = [];
    const origin = data.coordinateOrigin;
    const positions = data.positions;
    for (let i = 0; i < data.pointCount; i++) {
        const base = i * 3;
        const x = positions[base];
        const y = positions[base + 1];
        const z = positions[base + 2];
        if (x === undefined || y === undefined || z === undefined) continue;
        points.push({
            lng: origin[0] + x,
            lat: origin[1] + y,
            z,
        });
    }
    return points;
}

/**
 * The visualization mesh: the top-surface TIN itself, its triangles mapped
 * back to degree corners — resolution follows the data.
 */
export function buildTopSurfacePolygons(
    insidePoints: GeoPoint[],
    boundary: GeoPoint[],
): [number, number, number][][] {
    const site = projectMeasurementSite(boundary, insidePoints);
    if (!site) return [];

    const polygons: [number, number, number][][] = [];
    for (const tri of trianglesInsideBoundary(site)) {
        const a = site.cloud[tri.a];
        const b = site.cloud[tri.b];
        const c = site.cloud[tri.c];
        if (!a || !b || !c) continue;
        polygons.push([a, b, c].map((v) => toFrameCorner(site.frame, v)));
    }
    return polygons;
}

function toFrameCorner(
    frame: LocalMetricFrame,
    v: MetricPoint,
): [number, number, number] {
    const [lng, lat] = frame.toDegrees(v.x, v.y);
    return [lng, lat, v.z];
}
