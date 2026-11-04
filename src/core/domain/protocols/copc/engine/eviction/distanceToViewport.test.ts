import { describe, expect, it } from "vitest";
import { Bbox, type BBox3D } from "@core/lib/geo";
import { distanceToViewportMeters } from "./distanceToViewport";

const VIEWPORT: [number, number, number, number] = [10, 10, 11, 11];

function box(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
): BBox3D {
    return Bbox.fromCorners({ minX, minY, minZ: 0, maxX, maxY, maxZ: 0 });
}

describe("distanceToViewportMeters", () => {
    it("is zero for a node inside the viewport", () => {
        expect(distanceToViewportMeters(box(10.2, 10.2, 10.8, 10.8), VIEWPORT)).toBe(0);
    });

    it("is zero for a node merely touching the edge", () => {
        expect(distanceToViewportMeters(box(11, 10, 12, 11), VIEWPORT)).toBe(0);
    });

    it("measures the gap to the nearest edge, in meters", () => {
        // 0.01° of latitude ≈ 1113 m north of the viewport.
        const d = distanceToViewportMeters(box(10, 11.01, 11, 11.02), VIEWPORT);
        expect(d).toBeGreaterThan(1000);
        expect(d).toBeLessThan(1250);
    });

    it("scales longitude degrees by cos(latitude)", () => {
        // Same 1° gap east vs north at ~55°N: east must be ~cos(55°) of north.
        const north = distanceToViewportMeters(
            box(10, 57, 11, 58),
            [10, 55, 11, 56],
        );
        const east = distanceToViewportMeters(
            box(12, 55, 13, 56),
            [10, 55, 11, 56],
        );
        expect(east / north).toBeCloseTo(Math.cos((55 * Math.PI) / 180), 1);
    });

    it("takes the diagonal when the node sits beyond a corner", () => {
        const d = distanceToViewportMeters(box(12, 12, 13, 13), VIEWPORT);
        const straight = distanceToViewportMeters(box(10, 12, 11, 13), VIEWPORT);
        expect(d).toBeGreaterThan(straight);
    });
});
