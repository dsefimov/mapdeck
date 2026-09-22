import { describe, expect, it } from "vitest";
import type { BaseMapConfig } from "@core/contracts";
import {
    loadBasemapConfigs,
    parseBasemapConfigs,
} from "./loadBasemapConfigs";

function entry(
    overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
    return {
        id: "bm",
        name: "A basemap",
        style: { sources: { s: { type: "raster", tiles: ["https://t/{z}/{x}/{y}"] } } },
        ...overrides,
    };
}

describe("parseBasemapConfigs", () => {
    it("passes a well-formed config through", () => {
        const configs = parseBasemapConfigs([
            entry({ id: "a", attribution: "© Someone" }),
        ]);

        expect(configs).toHaveLength(1);
        expect(configs[0]).toMatchObject({ id: "a", attribution: "© Someone" });
    });

    it("accepts a styleUrl entry without an inline style", () => {
        const configs = parseBasemapConfigs([
            entry({ style: undefined, styleUrl: "https://t/style.json" }),
        ]);

        expect(configs[0]?.styleUrl).toBe("https://t/style.json");
    });

    it.each([
        ["a non-string id", { id: 7 }],
        ["an empty name", { name: " " }],
        ["a style without sources", { style: { layers: [] } }],
        ["neither style nor styleUrl", { style: undefined }],
        ["a non-string attribution", { attribution: 5 }],
    ])("rejects %s loudly", (_case, overrides) => {
        expect(() => parseBasemapConfigs([entry(overrides)])).toThrow(
            /Basemap config entry/,
        );
    });

    it("names the entry by index when it carries no readable id", () => {
        expect(() => parseBasemapConfigs(["junk"])).toThrow(
            /Basemap config entry #0/,
        );
    });

    it("rejects a non-array root", () => {
        expect(() => parseBasemapConfigs({})).toThrow("must be an array");
    });
});

// The real asset must always satisfy its own parser — the loader is the
// single gate both consumers went through casts for.
describe("loadBasemapConfigs", () => {
    it("validates the shipped config asset", () => {
        const configs: readonly BaseMapConfig[] = loadBasemapConfigs();

        expect(configs.length).toBeGreaterThan(0);
        for (const config of configs) {
            expect(typeof config.id).toBe("string");
            expect(typeof config.name).toBe("string");
        }
    });
});
