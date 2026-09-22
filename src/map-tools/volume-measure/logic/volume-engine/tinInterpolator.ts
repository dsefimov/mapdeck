/**
 * TIN-based base surface interpolator from boundary vertices in a local
 * metric frame.
 */

import {
    delaunayTriangulate,
    type PointXY,
    type Triangle,
} from "@core/lib/geo";
import type { MetricPoint } from "./types";

/**
 * Degenerate-triangle guard: the barycentric denominator is proportional to
 * the signed triangle area, so near-zero means collinear vertices.
 */
const DEGENERATE_AREA_EPSILON = 1e-12;

/**
 * A barycentric weight may go this far negative and still count as inside —
 * cloud points land marginally outside an edge after metric-frame rounding.
 */
const BARYCENTRIC_EDGE_TOLERANCE = 0.001;

export class BaseSurfaceInterpolator {
    private vertices: PointXY[];
    private zValues: number[];
    private triangles: Triangle[];
    private fallbackZ: number;

    constructor(boundary: MetricPoint[]) {
        this.vertices = boundary.map((p) => ({ x: p.x, y: p.y }));
        this.zValues = boundary.map((p) => p.z);
        this.triangles = delaunayTriangulate(this.vertices);
        this.fallbackZ = this.zValues[0] ?? 0;
    }

    interpolate(x: number, y: number): number {
        const pt = { x, y };

        for (const tri of this.triangles) {
            const z = this.tryBarycentric(pt, tri);
            if (z !== null) return z;
        }

        return this.fallbackZ;
    }

    private tryBarycentric(pt: PointXY, tri: Triangle): number | null {
        const weights = this.barycentricWeights(pt, tri);
        if (!weights) return null;
        const [w1, w2, w3] = weights;

        const za = this.zValues[tri.a];
        const zb = this.zValues[tri.b];
        const zc = this.zValues[tri.c];
        if (za === undefined || zb === undefined || zc === undefined) {
            return null;
        }

        return w1 * za + w2 * zb + w3 * zc;
    }

    /** Barycentric weights of `pt` in `tri`; null for a degenerate
     * triangle or a point outside it. */
    private barycentricWeights(
        pt: PointXY,
        tri: Triangle,
    ): [number, number, number] | null {
        const a = this.vertices[tri.a];
        const b = this.vertices[tri.b];
        const c = this.vertices[tri.c];
        if (!a || !b || !c) return null;

        const denom = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        if (Math.abs(denom) < DEGENERATE_AREA_EPSILON) return null;

        const w1 =
            ((b.y - c.y) * (pt.x - c.x) + (c.x - b.x) * (pt.y - c.y)) / denom;
        const w2 =
            ((c.y - a.y) * (pt.x - c.x) + (a.x - c.x) * (pt.y - c.y)) / denom;
        const w3 = 1 - w1 - w2;

        if (
            w1 < -BARYCENTRIC_EDGE_TOLERANCE ||
            w2 < -BARYCENTRIC_EDGE_TOLERANCE ||
            w3 < -BARYCENTRIC_EDGE_TOLERANCE
        ) {
            return null;
        }

        return [w1, w2, w3];
    }
}
