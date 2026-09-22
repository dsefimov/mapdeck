import { describe, expect, it } from "vitest";
import { getScreenSpaceError, type SSECameraContext } from "./screenSpaceError";

const FOV_60 = Math.PI / 3;

function camera(pixelRatio: number): SSECameraContext {
    return {
        fovVerticalRadians: FOV_60,
        screenHeightPx: 1080,
        pixelRatio,
    };
}

describe("getScreenSpaceError", () => {
    it("shrinks in inverse proportion to the distance", () => {
        const near = getScreenSpaceError(10, 100, camera(1));
        const far = getScreenSpaceError(10, 1000, camera(1));
        expect(near).toBeCloseTo(far * 10, 9);
    });

    it("grows in proportion to the geometric error", () => {
        const coarse = getScreenSpaceError(40, 1000, camera(1));
        const fine = getScreenSpaceError(10, 1000, camera(1));
        expect(coarse).toBeCloseTo(fine * 4, 9);
    });

    it("halves on a display with twice the device pixel ratio", () => {
        const standard = getScreenSpaceError(10, 1000, camera(1));
        expect(getScreenSpaceError(10, 1000, camera(2))).toBeCloseTo(
            standard / 2,
            9,
        );
    });

    it.each<[number, number, number]>([
        [1000, 1, 9.3531],
        [100, 1, 93.5307],
        [1000, 2, 4.6765],
    ])(
        "projects a 10 m error seen from %i m at pixel ratio %i",
        (distance, pixelRatio, expected) => {
            expect(
                getScreenSpaceError(10, distance, camera(pixelRatio)),
            ).toBeCloseTo(expected, 3);
        },
    );

    it.each<[number]>([[0], [-100]])(
        "reports an unbounded error at a distance of %i, so a tile reaching the camera always refines",
        (distance) => {
            expect(getScreenSpaceError(10, distance, camera(1))).toBe(Infinity);
        },
    );

    it("reports an unbounded error for a distance that never resolved", () => {
        expect(getScreenSpaceError(10, NaN, camera(1))).toBe(Infinity);
    });

    it("keeps every comparison against a threshold answerable", () => {
        const unresolved = getScreenSpaceError(10, NaN, camera(1));

        expect(unresolved > 2).toBe(true);
    });
});
