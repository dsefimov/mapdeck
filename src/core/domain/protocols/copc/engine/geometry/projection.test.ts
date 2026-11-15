import { describe, expect, it } from "vitest";
import { Bbox, type BBox3D } from "@core/lib/geo";
import {
    MIN_GROUND_RES,
    computeDistanceToCamera,
    computeGeometricError,
    computeGroundResolution,
    computeRootSpacing,
    type RootSpacingInput,
} from "./projection";

const FOV_60 = Math.PI / 3;
const SCREEN_HEIGHT_PX = 1080;

type Extent = Omit<RootSpacingInput, "spacing" | "totalPoints">;

/** 10 m cube: volume 1000, diagonal sqrt(300). */
const CUBE_10: Extent = {
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 10,
    maxY: 10,
    maxZ: 10,
};

/** Zero-height cloud: volume 0, diagonal 5. */
const FLAT_3_4: Extent = {
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 3,
    maxY: 4,
    maxZ: 0,
};

/** No extent at all: volume 0, diagonal 0. */
const POINT_LIKE: Extent = {
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 0,
    maxY: 0,
    maxZ: 0,
};

const CUBE_10_BOX: BBox3D = Bbox.fromCorners(CUBE_10);

describe("computeRootSpacing", () => {
    it.each<[string, RootSpacingInput, number]>([
        [
            "the declared spacing wins over any estimate",
            { ...CUBE_10, spacing: 100, totalPoints: 1000 },
            100,
        ],
        [
            "a non-positive spacing is treated as absent",
            { ...CUBE_10, spacing: -5, totalPoints: 1000 },
            1,
        ],
        [
            "falls back to the density estimate when spacing is absent",
            { ...CUBE_10, spacing: 0, totalPoints: 1000 },
            1,
        ],
        [
            "the density estimate grows as the point count drops",
            { ...CUBE_10, spacing: 0, totalPoints: 8 },
            5,
        ],
        [
            "falls back to the half-diagonal when the cloud has no volume",
            { ...FLAT_3_4, spacing: 0, totalPoints: 1000 },
            2.5,
        ],
        [
            "falls back to the half-diagonal when the point count is unknown",
            { ...CUBE_10, spacing: 0, totalPoints: 0 },
            Math.sqrt(300) / 2,
        ],
        [
            "yields one when every dimension degenerates",
            { ...POINT_LIKE, spacing: 0, totalPoints: 0 },
            1,
        ],
    ])("%s", (_case, input, expected) => {
        expect(computeRootSpacing(input)).toBeCloseTo(expected, 6);
    });
});

describe("computeGeometricError", () => {
    it.each<[number, number]>([
        [0, 100],
        [1, 50],
        [3, 12.5],
        [10, 100 / 1024],
    ])("halves the root spacing at every depth, depth %i", (depth, expected) => {
        expect(computeGeometricError(100, depth)).toBeCloseTo(expected, 9);
    });
});

describe("computeDistanceToCamera", () => {
    it.each<[string, [number, number, number], number]>([
        ["zero while the camera sits inside the box", [5, 5, 5], 0],
        ["the gap to the nearest face", [20, 5, 5], 10],
        ["the vertical gap for a camera overhead", [5, 5, 30], 20],
        ["the diagonal gap to the nearest edge", [20, 20, 10], Math.sqrt(200)],
    ])("measures %s", (_case, cameraPos, expected) => {
        expect(computeDistanceToCamera(cameraPos, CUBE_10_BOX)).toBeCloseTo(
            expected,
            9,
        );
    });
});

describe("computeGroundResolution", () => {
    it.each<[number, number]>([
        [2000, 2],
        [500, 0.5],
    ])(
        "grows in proportion to the distance, %i m against the 1000 m baseline",
        (distance, ratio) => {
            const baseline = computeGroundResolution(
                1000,
                FOV_60,
                SCREEN_HEIGHT_PX,
            );
            expect(
                computeGroundResolution(distance, FOV_60, SCREEN_HEIGHT_PX),
            ).toBeCloseTo(baseline * ratio, 9);
        },
    );

    it("spreads the visible height at that distance across the screen", () => {
        const visibleHeight = 2 * 1000 * Math.tan(FOV_60 / 2);
        expect(
            computeGroundResolution(1000, FOV_60, SCREEN_HEIGHT_PX),
        ).toBeCloseTo(visibleHeight / SCREEN_HEIGHT_PX, 9);
    });

    it.each<[number]>([[0], [-5]])(
        "falls back to the floor resolution for a screen height of %i",
        (screenHeightPx) => {
            expect(computeGroundResolution(1000, FOV_60, screenHeightPx)).toBe(
                MIN_GROUND_RES,
            );
        },
    );
});
