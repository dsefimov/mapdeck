import { describe, expect, it } from "vitest";
import { hexToHue, hueToHex, rgbToHue } from "./hue";

describe("hueToHex", () => {
    it.each([
        [0, "#ff0000"],
        [60, "#ffff00"],
        [120, "#00ff00"],
        [180, "#00ffff"],
        [240, "#0000ff"],
        [300, "#ff00ff"],
        [360, "#ff0000"],
    ])("maps hue %p to %s", (hue, hex) => {
        expect(hueToHex(hue)).toBe(hex);
    });
});

describe("rgbToHue", () => {
    it.each([
        { name: "red", rgb: [1, 0, 0], hue: 0 },
        { name: "green", rgb: [0, 1, 0], hue: 120 },
        { name: "blue", rgb: [0, 0, 1], hue: 240 },
    ])("$name → $hue°", ({ rgb, hue }) => {
        expect(rgbToHue(rgb[0]!, rgb[1]!, rgb[2]!)).toBe(hue);
    });

    it("reads grays as 0, not NaN", () => {
        expect(rgbToHue(0.5, 0.5, 0.5)).toBe(0);
        expect(rgbToHue(1, 1, 1)).toBe(0);
    });
});

describe("hexToHue", () => {
    it.each([
        ["#ff0000", 0],
        ["#ffff00", 60],
        ["#00ff00", 120],
        ["#0000ff", 240],
    ])("%s → %p°", (hex, hue) => {
        expect(hexToHue(hex)).toBe(hue);
    });

    it("accepts the short #RGB form", () => {
        expect(hexToHue("#0f0")).toBe(120);
    });

    it("is circular: hueToHex ∘ hexToHue returns the wheel color", () => {
        for (const hue of [0, 45, 90, 180, 270, 359, 360]) {
            expect(hexToHue(hueToHex(hue))).toBe(hue % 360);
        }
    });

    it("throws on invalid hex rather than inventing a hue", () => {
        expect(() => hexToHue("nope")).toThrow();
    });
});
