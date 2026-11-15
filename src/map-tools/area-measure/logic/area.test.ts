import { describe, expect, it } from "vitest";

import type { GeoPoint } from "@core/lib/geo";
import { measurePolygonArea } from "./area";

const p = (lng: number, lat: number): GeoPoint => ({ lng, lat, z: 0 });

/** A square near the equator: 0.01° of latitude ≈ 1111.9 m. */
const SQUARE = [p(0, 0), p(0.01, 0), p(0.01, 0.01), p(0, 0.01)];

describe("measurePolygonArea", () => {
    it("returns zeroed measurements below three vertices", () => {
        const result = measurePolygonArea([p(0, 0), p(1, 1)]);

        expect(result.areaSquareMeters).toBe(0);
        expect(result.edges).toHaveLength(1);
        expect(result.vertexCount).toBe(2);
    });

    it("builds one edge per consecutive vertex pair", () => {
        const result = measurePolygonArea([...SQUARE, p(5, 5)]);
        expect(result.edges).toHaveLength(4);
        expect(result.vertexCount).toBe(5);
    });

    it("computes the area and perimeter of an axis-aligned square", () => {
        const result = measurePolygonArea(SQUARE);

        const side = result.perimeterMeters / 4;
        // Turf area vs geodesic perimeter agree to within a percent.
        expect(result.areaSquareMeters).toBeCloseTo(side * side, -4);
        expect(result.areaSquareMeters).toBeGreaterThan(1_000_000);
    });

    it("closes the ring implicitly — last-to-first edge affects only the edge list", () => {
        const open = measurePolygonArea(SQUARE.slice(0, 3));
        expect(open.areaSquareMeters).toBeGreaterThan(0);
        expect(open.edges).toHaveLength(2);
    });
});
