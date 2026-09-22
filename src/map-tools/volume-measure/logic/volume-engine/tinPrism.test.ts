import { describe, expect, it } from "vitest";
import type { GeoPoint } from "@core/lib/geo";
import { createLocalMetricFrame } from "@core/lib/geo";
import { calculateTinPrismVolume } from "./tinPrism";
import { buildTopSurfacePolygons } from "../volume";

/**
 * Analytic references for the TIN-prism engine. All degree math in the
 * fixtures is written out via equator/meridian constants — never via the
 * code under test.
 */
const METERS_PER_EQUATOR_DEGREE = 111_320;
const METERS_PER_MERIDIAN_DEGREE = 111_132;

function geoFactory(centerLng: number, centerLat: number) {
    const cosLat = Math.cos((centerLat * Math.PI) / 180);
    return {
        toLng: (m: number) =>
            centerLng + m / (METERS_PER_EQUATOR_DEGREE * cosLat),
        toLat: (m: number) => centerLat + m / METERS_PER_MERIDIAN_DEGREE,
        point: (x: number, y: number, z: number): GeoPoint => ({
            lng: centerLng + x / (METERS_PER_EQUATOR_DEGREE * cosLat),
            lat: centerLat + y / METERS_PER_MERIDIAN_DEGREE,
            z,
        }),
    };
}

/** Flat slab: 100×100 m boundary over a cloud sampled on a 2 m grid. */
function slabFixture(centerLng: number, centerLat: number, cloudZ = 10) {
    const g = geoFactory(centerLng, centerLat);
    const half = 50;
    const boundary: GeoPoint[] = [
        g.point(-half, -half, 0),
        g.point(half, -half, 0),
        g.point(half, half, 0),
        g.point(-half, half, 0),
    ];
    const cloud: GeoPoint[] = [];
    for (let x = -half; x <= half; x += 2) {
        for (let y = -half; y <= half; y += 2) {
            cloud.push(g.point(x, y, cloudZ));
        }
    }
    return { boundary, cloud };
}

/** Hemisphere of radius 15 m: V = 2/3·π·r³ ≈ 7068.58 m³. */
function hemisphereFixture(centerLng: number, centerLat: number) {
    const g = geoFactory(centerLng, centerLat);
    const r = 15;
    const boundary: GeoPoint[] = [];
    for (let i = 0; i < 64; i++) {
        const t = (i / 64) * 2 * Math.PI;
        boundary.push(g.point(r * Math.cos(t), r * Math.sin(t), 0));
    }
    const cloud: GeoPoint[] = [];
    for (let x = -r; x <= r; x += 0.5) {
        for (let y = -r; y <= r; y += 0.5) {
            const d2 = x * x + y * y;
            if (d2 > r * r) continue;
            cloud.push(g.point(x, y, Math.sqrt(r * r - d2)));
        }
    }
    return { boundary, cloud, analytic: (2 / 3) * Math.PI * r ** 3 };
}

/** Cone r = 20 m, h = 5 m: V = π·r²·h/3 ≈ 2094.40 m³. */
function coneFixture(centerLng: number, centerLat: number) {
    const g = geoFactory(centerLng, centerLat);
    const r = 20;
    const h = 5;
    const boundary: GeoPoint[] = [];
    for (let i = 0; i < 64; i++) {
        const t = (i / 64) * 2 * Math.PI;
        boundary.push(g.point(r * Math.cos(t), r * Math.sin(t), 0));
    }
    const cloud: GeoPoint[] = [];
    for (let x = -r; x <= r; x += 0.5) {
        for (let y = -r; y <= r; y += 0.5) {
            const d = Math.sqrt(x * x + y * y);
            if (d > r) continue;
            cloud.push(g.point(x, y, h * (1 - d / r)));
        }
    }
    return { boundary, cloud, analytic: (Math.PI * r * r * h) / 3 };
}

describe("calculateTinPrismVolume", () => {
    it.each([0, 56, -56])(
        "measures the same flat slab at latitude %i",
        (lat) => {
            const { boundary, cloud } = slabFixture(30, lat);
            const result = calculateTinPrismVolume(boundary, cloud);

            // 5000 quads → ≥4800 triangles (projection curvature adds hull
            // vertices). Fill/area within 1% — the hand-constant degree
            // spans differ from the ellipsoid truth by up to ~0.5%.
            expect(result.triangleCount).toBeGreaterThan(4800);
            expect(result.fillCubicMeters / 100_000).toBeGreaterThan(0.99);
            expect(result.fillCubicMeters / 100_000).toBeLessThan(1.01);
            expect(result.cutCubicMeters).toBe(0);
            expect(result.surfaceAreaSquareMeters / 10_000).toBeGreaterThan(
                0.99,
            );
            expect(result.surfaceAreaSquareMeters / 10_000).toBeLessThan(1.01);
            expect(result.surfaceZMin).toBeCloseTo(10, 6);
            expect(result.surfaceZMax).toBeCloseTo(10, 6);
            expect(result.baseZMin).toBeCloseTo(0, 6);
            expect(result.baseZMax).toBeCloseTo(0, 6);
        },
    );

    it("measures a hemisphere within 0.5% of the analytic volume", () => {
        const { boundary, cloud, analytic } = hemisphereFixture(30, 56);
        const result = calculateTinPrismVolume(boundary, cloud);

        expect(result.fillCubicMeters / analytic).toBeCloseTo(1, 2);
        expect(result.cutCubicMeters).toBe(0);
    });

    it("measures a cone within 1% of the analytic volume", () => {
        const { boundary, cloud, analytic } = coneFixture(30, 56);
        const result = calculateTinPrismVolume(boundary, cloud);

        expect(result.fillCubicMeters / analytic).toBeCloseTo(1, 2);
    });

    it("accumulates below-base prisms as cut", () => {
        const { boundary, cloud } = slabFixture(30, 56, 0);
        const baseLifted = boundary.map((p) => ({ ...p, z: 10 }));

        const result = calculateTinPrismVolume(baseLifted, cloud);

        expect(result.cutCubicMeters / 100_000).toBeGreaterThan(0.99);
        expect(result.cutCubicMeters / 100_000).toBeLessThan(1.01);
        expect(result.fillCubicMeters).toBe(0);
    });

    it("excludes triangles bridging a concave notch", () => {
        const g = geoFactory(30, 56);
        // L-shape: 100×100 minus the [40..100]×[40..100] notch → 6400 m².
        const boundary: GeoPoint[] = [
            g.point(0, 0, 0),
            g.point(100, 0, 0),
            g.point(100, 40, 0),
            g.point(40, 40, 0),
            g.point(40, 100, 0),
            g.point(0, 100, 0),
        ];
        const cloud: GeoPoint[] = [];
        for (let x = 0; x <= 100; x += 2) {
            for (let y = 0; y <= 100; y += 2) {
                if (x <= 40 || y <= 40) cloud.push(g.point(x, y, 10));
            }
        }

        const result = calculateTinPrismVolume(boundary, cloud);

        // Expected 64 000; counting the notch wholesale would give 100 000.
        expect(result.fillCubicMeters).toBeGreaterThan(60_000);
        expect(result.fillCubicMeters).toBeLessThan(70_000);
    });

    it("returns an empty result for degenerate inputs", () => {
        const { boundary, cloud } = slabFixture(30, 56);

        const noBoundary = calculateTinPrismVolume(boundary.slice(0, 2), cloud);
        const noCloud = calculateTinPrismVolume(boundary, cloud.slice(0, 2));

        expect(noBoundary.fillCubicMeters).toBe(0);
        expect(noBoundary.triangleCount).toBe(0);
        expect(noCloud.fillCubicMeters).toBe(0);
        expect(noCloud.triangleCount).toBe(0);
    });

    it("carries no meaningful volume for a collinear cloud", () => {
        const g = geoFactory(30, 56);
        const { boundary } = slabFixture(30, 56);
        const cloud: GeoPoint[] = [];
        for (let x = -50; x <= 50; x += 2) cloud.push(g.point(x, 0, 10));

        const result = calculateTinPrismVolume(boundary, cloud);

        // Projection curvature leaves sub-meter slivers; their volume is dust.
        expect(result.fillCubicMeters).toBeLessThan(1);
    });
});

describe("buildTopSurfacePolygons", () => {
    it("returns the top-surface TIN as degree triangles", () => {
        const { boundary, cloud } = slabFixture(30, 56);

        const polygons = buildTopSurfacePolygons(cloud, boundary);
        const result = calculateTinPrismVolume(boundary, cloud);

        expect(polygons.length).toBe(result.triangleCount);
        expect(polygons.length).toBeGreaterThan(4800);
        for (const corner of polygons[0]!) {
            expect(corner.length).toBe(3);
            expect(corner[2]).toBeCloseTo(10, 6);
        }

        // Corners back-project onto the 2 m cloud grid in frame meters.
        const frame = createLocalMetricFrame(30, 56);
        const corners = polygons[0]!.map(([lng, lat]) =>
            frame.toMeters(lng, lat),
        );
        for (const [x, y] of corners) {
            expect(Math.abs(x)).toBeLessThanOrEqual(50.001);
            expect(Math.abs(y)).toBeLessThanOrEqual(50.001);
        }
        const side = (i: number, j: number) =>
            Math.hypot(
                corners[i]![0] - corners[j]![0],
                corners[i]![1] - corners[j]![1],
            );
        expect(side(0, 1)).toBeGreaterThan(0.1);
        expect(side(1, 2)).toBeGreaterThan(0.1);
    });

    it("returns no mesh for a degenerate cloud", () => {
        const { boundary } = slabFixture(30, 56);

        expect(buildTopSurfacePolygons([], boundary)).toEqual([]);
    });
});
