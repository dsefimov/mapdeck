import { describe, expect, it } from "vitest";
import {
    isPointInPolygon,
    polygonBoundingBox,
    isPointInBoundingBox,
    greatCircleDistance,
    polygonPerimeter,
} from "./spatial";

/** Mean Earth radius used by the implementation, meters. */
const R = 6371008.8;

describe("isPointInPolygon", () => {
    const square: [number, number][] = [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
    ];

    it("accepts an interior point", () => {
        expect(isPointInPolygon([5, 5], square)).toBe(true);
    });

    it("rejects an exterior point", () => {
        expect(isPointInPolygon([15, 5], square)).toBe(false);
    });

    it("rejects a point in a concave notch", () => {
        const lShape: [number, number][] = [
            [0, 0],
            [10, 0],
            [10, 4],
            [4, 4],
            [4, 10],
            [0, 10],
        ];
        expect(isPointInPolygon([7, 7], lShape)).toBe(false);
        expect(isPointInPolygon([2, 7], lShape)).toBe(true);
    });

    it("accepts a closed ring — the repeated vertex is harmless", () => {
        const closed: [number, number][] = [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
        ];
        expect(isPointInPolygon([5, 5], closed)).toBe(true);
    });

    it("says outside for an empty polygon", () => {
        expect(isPointInPolygon([5, 5], [])).toBe(false);
    });
});

describe("polygonBoundingBox", () => {
    it("spans the vertices as [minX, minY, maxX, maxY]", () => {
        const polygon: [number, number][] = [
            [3, 7],
            [9, 1],
            [5, 4],
        ];

        expect(polygonBoundingBox(polygon)).toEqual([3, 1, 9, 7]);
    });
});

describe("isPointInBoundingBox", () => {
    const bbox: [number, number, number, number] = [0, 0, 10, 10];

    it("accepts interior and edge points, rejects outside", () => {
        expect(isPointInBoundingBox([5, 5], bbox)).toBe(true);
        expect(isPointInBoundingBox([0, 0], bbox)).toBe(true);
        expect(isPointInBoundingBox([10.1, 5], bbox)).toBe(false);
        expect(isPointInBoundingBox([-0.1, 5], bbox)).toBe(false);
    });
});

describe("greatCircleDistance", () => {
    it("is zero for identical points and positive otherwise", () => {
        expect(greatCircleDistance([30, 59], [30, 59])).toBe(0);
        expect(greatCircleDistance([30, 59], [30.001, 59])).toBeGreaterThan(
            50,
        );
        expect(greatCircleDistance([30, 59], [30.001, 59])).toBeLessThan(100);
    });

    it("matches the analytic arc lengths on the equator and a meridian", () => {
        const quarter = (Math.PI / 2) * R; // quarter of the circumference
        expect(greatCircleDistance([0, 0], [90, 0])).toBeCloseTo(
            quarter,
            6,
        );
        expect(greatCircleDistance([0, 0], [0, 90])).toBeCloseTo(
            quarter,
            6,
        );
        expect(greatCircleDistance([0, 0], [180, 0])).toBeCloseTo(
            Math.PI * R,
            6,
        );
        expect(greatCircleDistance([0, 0], [1, 0])).toBeCloseTo(
            (Math.PI / 180) * R,
            6,
        );
    });

    it("matches the value turf produced on the Vincenty test pair", () => {
        // Flinders Peak → Buninyong Gap. The WGS84 geodesic is
        // 54 972.271 m (Vincenty 1975); the spherical model reads
        // ~0.085% short — the documented accuracy trade-off.
        const d = greatCircleDistance(
            [144.42486789, -37.95103342],
            [143.92649553, -37.65282114],
        );
        expect(d).toBeCloseTo(54925.508, 2);
    });

    it("stays finite for near-antipodal pairs", () => {
        // h lands a rounding-hair from 1; the clamp keeps asin in
        // range instead of producing NaN on some engines.
        const d = greatCircleDistance([0, 10], [180, -10]);
        expect(Number.isFinite(d)).toBe(true);
        expect(d).toBeGreaterThan(20_000_000);
        expect(d).toBeLessThanOrEqual(Math.PI * R);
    });
});

describe("polygonPerimeter", () => {
    it("closes the ring: the last vertex connects back to the first", () => {
        const square: [number, number][] = [
            [0, 0],
            [0.001, 0],
            [0.001, 0.001],
            [0, 0.001],
        ];

        // 0.001° along the equator is exactly (Math.PI / 180) * R * 0.001
        // meters; four such sides.
        const side = (Math.PI / 180) * R * 0.001;
        expect(polygonPerimeter(square)).toBeCloseTo(
            4 * side,
            4,
        );
    });

    it("gives the there-and-back length for two points", () => {
        const d = greatCircleDistance([0, 0], [0.001, 0]);
        expect(polygonPerimeter([[0, 0], [0.001, 0]])).toBeCloseTo(
            2 * d,
            9,
        );
    });

    it("is zero for fewer than two points", () => {
        expect(polygonPerimeter([[0, 0]])).toBe(0);
        expect(polygonPerimeter([])).toBe(0);
    });
});
