import { describe, expect, it } from "vitest";
import type { BboxTuple } from "./types";
import { Bbox } from "./types";
import { bboxFromGeometry, flattenTo2D, findBboxProblem, unionBbox } from "./bbox";

describe("bboxFromGeometry", () => {
    it("extracts a polygon's extent", () => {
        const bbox = bboxFromGeometry(
            polygon([
                [2, 1],
                [5, 1],
                [5, 4],
                [2, 1],
            ]),
        );

        expect([bbox?.west, bbox?.south, bbox?.east, bbox?.north]).toEqual([
            2, 1, 5, 4,
        ]);
    });

    it("spans a MultiPolygon across all rings", () => {
        const bbox = bboxFromGeometry({
            type: "MultiPolygon",
            coordinates: [
                [
                    [
                        [0, 0],
                        [1, 0],
                        [1, 1],
                        [0, 0],
                    ],
                ],
                [
                    [
                        [10, 10],
                        [12, 10],
                        [12, 12],
                        [10, 10],
                    ],
                ],
            ],
        });

        expect([bbox?.west, bbox?.south, bbox?.east, bbox?.north]).toEqual([
            0, 0, 12, 12,
        ]);
    });

    it("returns null for absent or malformed geometry", () => {
        expect(bboxFromGeometry(undefined)).toBeNull();
        expect(bboxFromGeometry(null)).toBeNull();
        expect(
            bboxFromGeometry({ type: "Polygon" }),
        ).toBeNull();
    });
});

describe("flattenTo2D", () => {
    it("drops the vertical extent of a 3D box", () => {
        // Tuple order: [west, south, minZ, east, north, maxZ].
        const flat = flattenTo2D(new Bbox([0, 1, 2, 3, 4, 5]));

        expect(flat.hasElevation()).toBe(false);
        expect(flat.minZ).toBeUndefined();
        expect([flat.west, flat.south, flat.east, flat.north]).toEqual([
            0, 1, 3, 4,
        ]);
    });

    it("returns the same instance for an already-2D box", () => {
        const box = new Bbox([0, 1, 2, 3]);
        expect(flattenTo2D(box)).toBe(box);
    });
});

describe("unionBbox", () => {
    it("returns the surviving box when one side is null", () => {
        const a = new Bbox([0, 0, 1, 1]);

        expect(unionBbox(a, null)).toBe(a);
        expect(unionBbox(null, a)).toBe(a);
        expect(unionBbox(null, null)).toBeNull();
    });

    it("spans both boxes", () => {
        const union = unionBbox(
            new Bbox([0, 0, 2, 2]),
            new Bbox([1, -1, 3, 1]),
        );

        expect([union?.west, union?.south, union?.east, union?.north]).toEqual(
            [0, -1, 3, 2],
        );
    });

    it("keeps the vertical extent when either box is 3D", () => {
        const union = unionBbox(
            new Bbox([0, 0, 5, 1, 1, 6]),
            new Bbox([0, 0, 1, 1]),
        );

        expect(union?.hasElevation()).toBe(true);
        expect(union?.minZ).toBe(5);
        expect(union?.maxZ).toBe(6);
    });
});

describe("findBboxProblem", () => {
    it("accepts a well-formed box", () => {
        expect(findBboxProblem(new Bbox([0, 0, 1, 1]))).toBeUndefined();
    });

    it("accepts a degenerate box — equal edges are a point or a line", () => {
        expect(findBboxProblem(new Bbox([0, 0, 0, 0]))).toBeUndefined();
        expect(
            findBboxProblem(new Bbox([0, 0, 1, 0])),
        ).toBeUndefined();
    });

    it("reports an inverted horizontal extent", () => {
        expect(findBboxProblem(new Bbox([2, 0, 1, 1]))).toBe(
            "inverted-horizontal",
        );
    });

    it("reports an inverted vertical extent", () => {
        expect(findBboxProblem(new Bbox([0, 2, 1, 1]))).toBe(
            "inverted-vertical",
        );
    });

    it("reports an inverted elevation extent", () => {
        expect(findBboxProblem(new Bbox([0, 0, 6, 1, 1, 5]))).toBe(
            "inverted-elevation",
        );
    });

    it("rejects an antimeridian-crossing box as inverted", () => {
        expect(findBboxProblem(new Bbox([170, -10, -170, 10]))).toBe(
            "inverted-horizontal",
        );
    });
});

describe("Bbox tuple arity", () => {
    it("rejects a 5-element tuple instead of silently reading it as 2D", () => {
        const five = [0, 0, 1, 1, 2] as unknown as BboxTuple;
        expect(() => new Bbox(five)).toThrow(/4-element/);
    });

    it("rejects a too-short tuple", () => {
        const three = [0, 0, 1] as unknown as BboxTuple;
        expect(() => new Bbox(three)).toThrow(/4-element/);
    });
});

function polygon(ring: [number, number][]): unknown {
    return {
        type: "Polygon",
        coordinates: [ring],
    };
}
