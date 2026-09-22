import { describe, expect, it } from "vitest";
import { joinAssetBase, parseRuntimeConfig } from "./runtimeConfig";

describe("parseRuntimeConfig", () => {
    it("accepts a full config", () => {
        const config = parseRuntimeConfig({
            assetsBase: "assets/",
            basemapTileOverrides: {
                osm_standard: ["https://cache.internal/osm/{z}/{x}/{y}.png"],
            },
        });

        expect(config.assetsBase).toBe("assets/");
        expect(config.basemapTileOverrides["osm_standard"]).toEqual([
            "https://cache.internal/osm/{z}/{x}/{y}.png",
        ]);
    });

    it("falls back to defaults on a non-object payload", () => {
        expect(parseRuntimeConfig("nope")).toEqual({
            assetsBase: "",
            basemapTileOverrides: {},
        });
        expect(parseRuntimeConfig(null)).toEqual({
            assetsBase: "",
            basemapTileOverrides: {},
        });
    });

    it("drops malformed members instead of failing the whole config", () => {
        const config = parseRuntimeConfig({
            assetsBase: 42,
            basemapTileOverrides: {
                good: ["https://t/{z}/{x}/{y}.png"],
                bad: ["https://t/{z}/{x}/{y}.png", 7],
                worse: "not-a-list",
            },
        });

        expect(config.assetsBase).toBe("");
        expect(Object.keys(config.basemapTileOverrides)).toEqual(["good"]);
    });
});

describe("joinAssetBase", () => {
    const NAME = "laz-perf.wasm";
    it.each([
        ["", NAME],
        ["assets", "assets/laz-perf.wasm"],
        ["assets/", "assets/laz-perf.wasm"],
        ["/portal/", "/portal/laz-perf.wasm"],
    ])("base %j + name → %s", (base, expected) => {
        expect(joinAssetBase(base, NAME)).toBe(expected);
    });
});
