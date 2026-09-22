import { describe, expect, it } from "vitest";
import type { GeoJSONGeometry } from "./types";
import { Bbox } from "./types";
import { bboxFromGeometry, flattenTo2D, unionBbox, validateBbox } from "./bbox";

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
        } as unknown as GeoJSONGeometry);

        expect([bbox?.west, bbox?.south, bbox?.east, bbox?.north]).toEqual([
            0, 0, 12, 12,
        ]);
    });

    it("returns null for absent or malformed geometry", () => {
        expect(bboxFromGeometry(undefined)).toBeNull();
        expect(bboxFromGeometry(null)).toBeNull();
        expect(
            bboxFromGeometry({ type: "Polygon" } as unknown as GeoJSONGeometry),
        ).toBeNull();
    });
});

describe("flattenTo2D", () => {
    it("drops the vertical extent of a 3D box", () => {
        // Tuple order: [west, south, minZ, east, north, maxZ].
        const flat = flattenTo2D(new Bbox([0, 1, 2, 3, 4, 5]));

        expect(flat.is3D).toBe(false);
        expect(flat.minZ).toBeUndefined();
        expect([flat.west, flat.south, flat.east, flat.north]).toEqual([
            0, 1, 3, 4,
        ]);
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

        expect(union?.is3D).toBe(true);
        expect(union?.minZ).toBe(5);
        expect(union?.maxZ).toBe(6);
    });
});

describe("validateBbox", () => {
    it("accepts a well-formed box", () => {
        const result = validateBbox(new Bbox([0, 0, 1, 1]));

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it("rejects an inverted box", () => {
        const result = validateBbox(new Bbox([2, 0, 1, 1]));

        expect(result.isValid).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it("rejects an inverted vertical extent", () => {
        const result = validateBbox(new Bbox([0, 0, 6, 1, 1, 5]));

        expect(result.isValid).toBe(false);
        expect(result.error).toContain("Z");
    });
});

describe("Bbox tuple arity", () => {
    it("rejects a 5-element tuple instead of silently reading it as 2D", () => {
        const five = [0, 0, 1, 1, 2] as unknown as ConstructorParameters<
            typeof Bbox
        >[0];
        expect(() => new Bbox(five)).toThrow(/4-element/);
    });

    it("rejects a too-short tuple", () => {
        const three = [0, 0, 1] as unknown as ConstructorParameters<
            typeof Bbox
        >[0];
        expect(() => new Bbox(three)).toThrow(/4-element/);
    });
});

function polygon(ring: [number, number][]): GeoJSONGeometry {
    return {
        type: "Polygon",
        coordinates: [ring],
    } as unknown as GeoJSONGeometry;
}
