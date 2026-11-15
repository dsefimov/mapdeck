import { describe, expect, it } from "vitest";
import { metersPerDegreeAt } from "./geoMath";

describe("metersPerDegreeAt", () => {
    it.each<[number, number]>([
        [60, 0.5],
        [-60, 0.5],
        [90, 0],
        [0, 1],
    ])(
        "scales the equatorial degree by the cosine of %i degrees",
        (latDeg, cosine) => {
            expect(metersPerDegreeAt(latDeg)).toBeCloseTo(
                metersPerDegreeAt(0) * cosine,
                6,
            );
        },
    );

    it("approximates the equatorial degree as 111 320 m", () => {
        expect(metersPerDegreeAt(0)).toBe(111_320);
    });
});
