import { describe, expect, it } from "vitest";
import { hexToRgba } from "./hexToRgba";

describe("hexToRgba", () => {
    it.each([
        ["#ffffff", [255, 255, 255, 255]],
        ["#0051ca", [0, 81, 202, 255]],
        ["fff", [255, 255, 255, 255]],
        ["#0051ca80", [0, 81, 202, 128]],
    ])("parses %s", (input, expected) => {
        expect(hexToRgba(input)).toEqual(expected);
    });

    it("applies the alpha argument to formats without their own alpha", () => {
        expect(hexToRgba("#fff", 128)).toEqual([255, 255, 255, 128]);
    });

    it.each([
        ["garbage"],
        ["#12g"],
        ["#12345"],
        [""],
        ["#12345zz"],
    ])("throws on invalid input %s instead of returning NaN channels", (input) => {
        expect(() => hexToRgba(input)).toThrow(/invalid hex color/);
    });
});
