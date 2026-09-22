import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { withSourceAttribution } from "./withSourceAttribution";

function style(): StyleSpecification {
    return {
        version: 8,
        sources: {
            osm: { type: "raster", tiles: ["https://t/{z}/{x}/{y}"] },
            extra: { type: "raster", tiles: ["https://e/{z}/{x}/{y}"] },
        },
        layers: [],
    } as StyleSpecification;
}

/** The spec union does not expose attribution uniformly — read it raw. */
function attributionOf(source: unknown): string | undefined {
    return (source as { attribution?: string }).attribution;
}

describe("withSourceAttribution", () => {
    it("stamps the attribution on every source", () => {
        const result = withSourceAttribution(style(), "© Someone");

        expect(attributionOf(result.sources.osm)).toBe("© Someone");
        expect(attributionOf(result.sources.extra)).toBe("© Someone");
    });

    it("does not mutate the incoming style", () => {
        const original = style();

        withSourceAttribution(original, "© Someone");

        expect(attributionOf(original.sources.osm)).toBeUndefined();
    });

    it("returns the same fragment when no override is set", () => {
        const original = style();

        expect(withSourceAttribution(original, undefined)).toBe(original);
    });
});
