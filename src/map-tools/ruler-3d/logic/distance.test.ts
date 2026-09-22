import { describe, expect, it } from "vitest";

import type { GeoPoint } from "@core/lib/geo";
import { euclidean3D, measurePolyline3D } from "./distance";

const p = (lng: number, lat: number, z: number): GeoPoint => ({ lng, lat, z });

describe("euclidean3D", () => {
    it("equals the height delta for a purely vertical step", () => {
        expect(euclidean3D(p(30, 59.9, 0), p(30, 59.9, 12))).toBeCloseTo(12);
    });

    it("equals the ground distance for a purely horizontal step", () => {
        const flat = euclidean3D(p(0, 0, 5), p(1, 0, 5));
        expect(flat).toBeGreaterThan(100_000);
        expect(euclidean3D(p(0, 0, 0), p(1, 0, 0))).toBeCloseTo(flat, 6);
    });

    it("combines ground and height as a right triangle", () => {
        const from = p(0, 0, 0);
        const to = p(0.01, 0, 300);
        const h = euclidean3D(from, { ...to, z: 0 });
        expect(euclidean3D(from, to)).toBeCloseTo(
            Math.sqrt(h * h + 300 * 300),
            6,
        );
    });
});

describe("measurePolyline3D", () => {
    it("returns zero totals on a single vertex", () => {
        const result = measurePolyline3D([p(0, 0, 0)]);
        expect(result.segments).toHaveLength(0);
        expect(result.totalDistance).toBe(0);
        expect(result.totalHorizontal).toBe(0);
        expect(result.totalVertical).toBe(0);
    });

    it("sums segment distances into the totals", () => {
        const result = measurePolyline3D([p(0, 0, 0), p(0.01, 0, 0), p(0.02, 0, 0)]);

        expect(result.segments).toHaveLength(2);
        expect(result.totalDistance).toBeCloseTo(
            result.segments[0]!.distanceMeters * 2,
            6,
        );
        expect(result.totalVertical).toBe(0);
    });

    it("tracks the vertical total across mixed segments", () => {
        const result = measurePolyline3D([p(0, 0, 0), p(0, 0, 10), p(0, 0, 4)]);
        expect(result.totalVertical).toBeCloseTo(16);
        expect(result.totalDistance).toBeCloseTo(16);
    });
});
