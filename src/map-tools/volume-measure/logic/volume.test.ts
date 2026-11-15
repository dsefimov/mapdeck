import { describe, expect, it } from "vitest";
import type { GeoPoint } from "@core/lib/geo";
import type { PointCloudData } from "@core/contracts";
import {
    extractPointsFromCloudData,
    filterPointsInsidePolygon,
    MAX_VOLUME_CLOUD_POINTS,
    thinPoints,
} from "./volume";

const pt = (lng: number, lat: number, z = 0): GeoPoint => ({ lng, lat, z });

describe("thinPoints", () => {
    it("passes a set under the cap through untouched", () => {
        const points = [pt(0, 0), pt(1, 0), pt(2, 0)];

        expect(thinPoints(points, MAX_VOLUME_CLOUD_POINTS)).toEqual({
            points,
            foundCount: 3,
        });
    });

    it("evens out an over-cap set by stride, keeping the first point", () => {
        const points = Array.from({ length: 7 }, (_, i) => pt(i, 0));

        // step = ceil(7 / 5) = 2 → indices 0, 2, 4, 6.
        const result = thinPoints(points, 5);

        expect(result.foundCount).toBe(7);
        expect(result.points.map((p) => p.lng)).toEqual([0, 2, 4, 6]);
    });
});

describe("filterPointsInsidePolygon", () => {
    const boundary = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];

    it("needs at least a triangle", () => {
        expect(filterPointsInsidePolygon(boundary.slice(0, 2), [])).toEqual([]);
    });

    it("keeps inside points and drops outside ones", () => {
        expect(
            filterPointsInsidePolygon(boundary, [
                pt(5, 5),
                pt(-1, 5),
                pt(11, 5)
            ])
        ).toEqual([pt(5, 5)]);
    });
});

describe("extractPointsFromCloudData", () => {
    it("adds the coordinate origin to every relative position", () => {
        const data = {
            coordinateOrigin: [10, 20, 0],
            positions: Float32Array.from([1, 2, 3, -1, -2, 5]),
            pointCount: 2,
        } as unknown as PointCloudData;

        expect(extractPointsFromCloudData(data)).toEqual([
            { lng: 11, lat: 22, z: 3 },
            { lng: 9, lat: 18, z: 5 },
        ]);
    });
});
