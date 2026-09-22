import { describe, expect, it } from "vitest";
import type { BBox3D } from "@core/lib/geo";
import type { NodeKey } from "../../types";
import { octreeCellBounds, type OctreeCube } from "./cellBounds";

/** Unit cube with a negative origin: exercises non-zero cubeMin offsets. */
const CUBE: OctreeCube = [-1, -1, -1, 1, 1, 1];

/** 8-unit cube anchored at the origin: offsets read directly as coordinates. */
const CUBE_8: OctreeCube = [0, 0, 0, 8, 8, 8];

function corners(bounds: BBox3D): number[] {
    return [
        bounds.minX,
        bounds.minY,
        bounds.minZ,
        bounds.maxX,
        bounds.maxY,
        bounds.maxZ,
    ];
}

interface CellCase {
    title: string;
    cube: OctreeCube;
    key: NodeKey;
    expected: number[];
}

describe("octreeCellBounds", () => {
    it.each<CellCase>([
        {
            title: "the root key spans the whole cube",
            cube: CUBE,
            key: [0, 0, 0, 0],
            expected: [-1, -1, -1, 1, 1, 1],
        },
        {
            title: "the first octant of a negative-anchored cube is its upper half",
            cube: CUBE,
            key: [1, 1, 1, 1],
            expected: [0, 0, 0, 1, 1, 1],
        },
        {
            title: "the last octant of a negative-anchored cube is its lower half",
            cube: CUBE,
            key: [1, 0, 0, 0],
            expected: [-1, -1, -1, 0, 0, 0],
        },
        {
            title: "a depth-2 cell is a quarter of the cube per edge",
            cube: CUBE,
            key: [2, 1, 2, 3],
            expected: [-0.5, 0, 0.5, 0, 0.5, 1],
        },
        {
            title: "an origin-anchored cube addresses cells by direct multiplication",
            cube: CUBE_8,
            key: [1, 1, 0, 1],
            expected: [4, 0, 4, 8, 4, 8],
        },
    ])("$title", ({ cube, key, expected }) => {
        expect(corners(octreeCellBounds(cube, key))).toEqual(expected);
    });

    it("halves the cell edge with every level of depth at a fixed x/y/z", () => {
        const depth1 = octreeCellBounds(CUBE, [1, 1, 1, 1]);
        const depth4 = octreeCellBounds(CUBE, [4, 8, 8, 8]);

        expect(depth4.maxX - depth4.minX).toBeCloseTo(
            (depth1.maxX - depth1.minX) / 8,
            12,
        );
        expect(depth4.minX).toBeCloseTo(depth1.minX, 12);
    });

    it("produces a box with min strictly below max on every axis", () => {
        const bounds = octreeCellBounds(CUBE, [3, 5, 2, 6]);

        expect(bounds.minX).toBeLessThan(bounds.maxX);
        expect(bounds.minY).toBeLessThan(bounds.maxY);
        expect(bounds.minZ).toBeLessThan(bounds.maxZ);
    });
});
