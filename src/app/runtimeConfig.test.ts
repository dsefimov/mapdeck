import { describe, expect, it } from "vitest";
import { joinAssetBase, parseRuntimeConfig } from "./runtimeConfig";

describe("parseRuntimeConfig", () => {
    it("accepts a full config", () => {
        const config = parseRuntimeConfig({ assetsBase: "assets/" });

        expect(config.assetsBase).toBe("assets/");
    });

    it("falls back to defaults on a non-object payload", () => {
        expect(parseRuntimeConfig("nope")).toEqual({ assetsBase: "" });
        expect(parseRuntimeConfig(null)).toEqual({ assetsBase: "" });
    });

    it("drops malformed members instead of failing the whole config", () => {
        const config = parseRuntimeConfig({ assetsBase: 42 });

        expect(config.assetsBase).toBe("");
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
