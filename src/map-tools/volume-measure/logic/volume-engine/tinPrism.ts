/**
 * TIN-prism volume calculation.
 *
 * The top surface is the Delaunay TIN of the cloud, the base is the TIN of
 * the boundary picks (see tinInterpolator). Every top triangle contributes
 * one prism: V = area × (h1 + h2 + h3) / 3, with h_i the height of the
 * triangle's vertices over the base — the exact integral of the
 * piecewise-linear surface, with no grid step, search radius or neighbor
 * count to tune. A triangle counts when its centroid lies inside the
 * boundary: pile heights taper to zero at the foot, so the boundary band
 * carries no volume. Prisms above the base accumulate as fill, below it
 * as cut.
 */

import type { GeoPoint, LocalMetricFrame } from "@core/lib/geo";
import {
    createLocalMetricFrame,
    delaunayTriangulate,
    isPointInPolygon,
    polygonBoundingBox,
} from "@core/lib/geo";
import type { Triangle } from "@core/lib/geo";
import type { MetricPoint } from "./types";
import { BaseSurfaceInterpolator } from "./tinInterpolator";

/** A measured site projected into its local metric frame. */
export interface MeasurementSite {
    readonly boundary: MetricPoint[];
    readonly cloud: MetricPoint[];
    readonly frame: LocalMetricFrame;
}

/** Aggregated output of the TIN-prism measurement. */
export interface TinPrismResult {
    fillCubicMeters: number;
    cutCubicMeters: number;
    surfaceAreaSquareMeters: number;
    baseZMin: number;
    baseZMax: number;
    surfaceZMin: number;
    surfaceZMax: number;
    triangleCount: number;
}

export const EMPTY_TIN_PRISM_RESULT: TinPrismResult = {
    fillCubicMeters: 0,
    cutCubicMeters: 0,
    surfaceAreaSquareMeters: 0,
    baseZMin: 0,
    baseZMax: 0,
    surfaceZMin: 0,
    surfaceZMax: 0,
    triangleCount: 0,
};

/** Projects the site into a local metric frame anchored at the boundary's
 * bbox center. */
export function projectMeasurementSite(
    boundary: GeoPoint[],
    cloudPoints: GeoPoint[],
): MeasurementSite | null {
    if (boundary.length < 3 || cloudPoints.length < 3) return null;

    const polygon2D: [number, number][] = boundary.map((p) => [p.lng, p.lat]);
    const bbox = polygonBoundingBox(polygon2D);
    const frame = createLocalMetricFrame(
        (bbox[0] + bbox[2]) / 2,
        (bbox[1] + bbox[3]) / 2,
    );

    return {
        boundary: boundary.map((p) => toMetricPoint(p, frame)),
        cloud: cloudPoints.map((p) => toMetricPoint(p, frame)),
        frame,
    };
}

/**
 * Top-surface triangles whose centroid lies inside the boundary — the
 * shared iteration domain of the volume sum and the mesh. Triangles
 * bridging a concave notch are dropped by the same test.
 */
export function trianglesInsideBoundary(site: MeasurementSite): Triangle[] {
    const polygon: [number, number][] = site.boundary.map((p) => [p.x, p.y]);
    return delaunayTriangulate(site.cloud).filter((tri) =>
        isCentroidInside(site.cloud, tri, polygon),
    );
}

interface PrismTotals {
    fill: number;
    cut: number;
    area: number;
    baseMin: number;
    baseMax: number;
    surfMin: number;
    surfMax: number;
}

/**
 * TIN-prism volume between the cloud's TIN and the boundary base TIN.
 */
export function calculateTinPrismVolume(
    boundary: GeoPoint[],
    cloudPoints: GeoPoint[],
): TinPrismResult {
    const site = projectMeasurementSite(boundary, cloudPoints);
    if (!site) return EMPTY_TIN_PRISM_RESULT;

    const base = new BaseSurfaceInterpolator(site.boundary);
    const totals = createTotals();
    const triangles = trianglesInsideBoundary(site);
    for (const tri of triangles) {
        const a = site.cloud[tri.a];
        const b = site.cloud[tri.b];
        const c = site.cloud[tri.c];
        if (!a || !b || !c) continue;
        accumulatePrism([a, b, c], base, totals);
    }

    return {
        fillCubicMeters: totals.fill,
        cutCubicMeters: totals.cut,
        surfaceAreaSquareMeters: totals.area,
        baseZMin: totals.baseMin === Infinity ? 0 : totals.baseMin,
        baseZMax: totals.baseMax === -Infinity ? 0 : totals.baseMax,
        surfaceZMin: totals.surfMin === Infinity ? 0 : totals.surfMin,
        surfaceZMax: totals.surfMax === -Infinity ? 0 : totals.surfMax,
        triangleCount: triangles.length,
    };
}

function toMetricPoint(p: GeoPoint, frame: LocalMetricFrame): MetricPoint {
    const [x, y] = frame.toMeters(p.lng, p.lat);
    return { x, y, z: p.z };
}

function isCentroidInside(
    cloud: MetricPoint[],
    tri: Triangle,
    polygon: [number, number][],
): boolean {
    const v0 = cloud[tri.a];
    const v1 = cloud[tri.b];
    const v2 = cloud[tri.c];
    if (!v0 || !v1 || !v2) return false;
    return isPointInPolygon(
        [(v0.x + v1.x + v2.x) / 3, (v0.y + v1.y + v2.y) / 3],
        polygon,
    );
}

function createTotals(): PrismTotals {
    return {
        fill: 0,
        cut: 0,
        area: 0,
        baseMin: Infinity,
        baseMax: -Infinity,
        surfMin: Infinity,
        surfMax: -Infinity,
    };
}

/** Adds one triangular prism to the totals; degenerate triangles are skipped. */
function accumulatePrism(
    verts: [MetricPoint, MetricPoint, MetricPoint],
    base: BaseSurfaceInterpolator,
    totals: PrismTotals,
): void {
    const [v0, v1, v2] = verts;
    const area = Math.abs(
        (v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x),
    ) / 2;
    if (area <= 0) return;

    const h0 = v0.z - base.interpolate(v0.x, v0.y);
    const h1 = v1.z - base.interpolate(v1.x, v1.y);
    const h2 = v2.z - base.interpolate(v2.x, v2.y);
    const prismVolume = (area * (h0 + h1 + h2)) / 3;
    if (prismVolume >= 0) {
        totals.fill += prismVolume;
    } else {
        totals.cut -= prismVolume;
    }

    totals.area += area;
    totals.surfMin = Math.min(totals.surfMin, v0.z, v1.z, v2.z);
    totals.surfMax = Math.max(totals.surfMax, v0.z, v1.z, v2.z);
    totals.baseMin = Math.min(
        totals.baseMin,
        v0.z - h0,
        v1.z - h1,
        v2.z - h2,
    );
    totals.baseMax = Math.max(
        totals.baseMax,
        v0.z - h0,
        v1.z - h1,
        v2.z - h2,
    );
}
