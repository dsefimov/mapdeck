import { describe, expect, it } from "vitest";
import { resolveStyle } from "./resolveStyle";

const DEFAULT = { paint: { "raster-opacity": 1 } };

describe("resolveStyle", () => {
    it("returns the default style as-is when no style is provided", () => {
        expect(resolveStyle(DEFAULT)).toBe(DEFAULT);
    });

    it("lets a provided style win at the top level", () => {
        const merged = resolveStyle(DEFAULT, {
            type: "raster",
            paint: { "raster-opacity": 0.5 },
        });
        expect(merged).toEqual({
            type: "raster",
            paint: { "raster-opacity": 0.5 },
        });
    });

    it("replaces nested objects wholesale (no deep merge)", () => {
        const merged = resolveStyle(
            { paint: { "raster-opacity": 1, "raster-brightness": 0.5 } },
            { paint: { "raster-opacity": 0.3 } },
        );
        // "raster-brightness" from the default is lost: paint is replaced.
        expect(merged.paint).toEqual({ "raster-opacity": 0.3 });
    });
});
