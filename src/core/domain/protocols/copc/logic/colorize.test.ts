import { describe, expect, it } from "vitest";
import {
    deriveClassificationColors,
    deriveElevationColors,
    deriveIntensityColors,
    deriveRgbColors,
    extractHeights,
    getElevationParams,
} from "./colorize";

describe("deriveRgbColors", () => {
    it("folds wide channels and keeps narrow ones as-is", () => {
        const colors = deriveRgbColors(
            {
                r: Uint16Array.from([200, 65_280]),
                g: Uint16Array.from([100, 256]),
                b: Uint16Array.from([50, 51_000]),
            },
            true,
            2,
        );

        expect([...colors]).toEqual([
            200, 100, 50, 255, 255, 1, 199, 255,
        ]);
    });

    it("fills white when the file carries no color", () => {
        const colors = deriveRgbColors(
            { r: null, g: null, b: null },
            false,
            3,
        );

        expect(colors).toHaveLength(12);
        expect([...colors]).toEqual(new Array(12).fill(255));
    });
});

describe("deriveIntensityColors", () => {
    it("maps unit intensity to gray across RGB with full alpha", () => {
        const colors = deriveIntensityColors(Float32Array.from([1, 0]));

        expect([...colors.slice(0, 4)]).toEqual([255, 255, 255, 255]);
        expect([...colors.slice(4, 8)]).toEqual([0, 0, 0, 255]);
    });
});

describe("deriveClassificationColors", () => {
    it("looks known codes up in the palette", () => {
        const colors = deriveClassificationColors(Uint8Array.from([2]));

        expect([...colors]).toEqual([165, 113, 78, 255]);
    });

    it("falls back to gray for codes outside the palette", () => {
        const colors = deriveClassificationColors(Uint8Array.from([12, 99]));

        expect([...colors.slice(0, 8)]).toEqual([
            128, 128, 128, 255, 128, 128, 128, 255,
        ]);
    });
});

describe("deriveElevationColors", () => {
    const bounds: [number, number, number, number, number, number] = [
        0, 0, 100, 0, 0, 200,
    ];

    it("runs blue at the floor through red at the ceiling", () => {
        const params = getElevationParams(bounds);
        const colors = deriveElevationColors(
            Float32Array.from([100, 150, 200]),
            params,
        );

        expect([...colors.slice(0, 4)]).toEqual([0, 0, 255, 255]);
        expect(colors[4]).toBe((0.5 * 255) | 0);
        expect(colors[6]).toBe((0.5 * 255) | 0);
        expect([...colors.slice(8, 12)]).toEqual([255, 0, 0, 255]);
    });

    it("clamps heights outside the global range", () => {
        const params = getElevationParams(bounds);
        const colors = deriveElevationColors(
            Float32Array.from([50, 250]),
            params,
        );

        expect([...colors.slice(0, 4)]).toEqual([0, 0, 255, 255]);
        expect([...colors.slice(4, 8)]).toEqual([255, 0, 0, 255]);
    });

    it("treats missing bounds as a unit range around zero", () => {
        const params = getElevationParams(null);
        const colors = deriveElevationColors(Float32Array.from([0]), params);

        expect(colors[1]).toBe(0);
    });
});

describe("extractHeights", () => {
    it("pulls every third component out of packed positions", () => {
        const positions = Float32Array.from([
            1, 2, 10,
            3, 4, 20,
            5, 6, 30,
        ]);

        expect([...extractHeights(positions)]).toEqual([10, 20, 30]);
    });
});
