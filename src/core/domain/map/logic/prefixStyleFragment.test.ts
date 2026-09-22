import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { prefixStyleFragment } from "./prefixStyleFragment";

const ORIGIN = "https://app.test";

function style(): Partial<StyleSpecification> {
    return {
        sources: {
            osm: { type: "raster", tiles: ["https://t/{z}/{x}/{y}"] },
        },
        layers: [
            { id: "bg", type: "raster", source: "osm" },
        ],
    } as Partial<StyleSpecification>;
}

/** The layer union has members without `source` — read it raw. */
function sourceOf(layer: unknown): string | undefined {
    return (layer as { source?: string }).source;
}

describe("prefixStyleFragment", () => {
    it("prefixes source and layer ids and remaps layer references", () => {
        const fragment = prefixStyleFragment(style(), "owner:", ORIGIN);

        expect(Object.keys(fragment.sources)).toEqual(["owner:osm"]);
        expect(fragment.layers[0]?.id).toBe("owner:bg");
        expect(sourceOf(fragment.layers[0])).toBe("owner:osm");
    });

    it("does not mutate the incoming fragment", () => {
        const original = style();

        prefixStyleFragment(original, "owner:", ORIGIN);

        expect(Object.keys(original.sources ?? {})).toEqual(["osm"]);
        expect(original.layers?.[0]?.id).toBe("bg");
    });

    it("resolves a relative sprite against the page origin", () => {
        const fragment = prefixStyleFragment(
            { ...style(), sprite: "sprites/basemap" },
            "owner:",
            ORIGIN,
        );

        expect(fragment.sprite).toBe(`${ORIGIN}/sprites/basemap`);
    });

    it("takes the first entry of a sprite array and omits it when absent", () => {
        const arrayForm = prefixStyleFragment(
            {
                ...style(),
                sprite: [{ url: "sprites/one" }, { url: "sprites/two" }],
            } as Partial<StyleSpecification>,
            "owner:",
            ORIGIN,
        );
        expect(arrayForm.sprite).toBe(`${ORIGIN}/sprites/one`);

        const bare = prefixStyleFragment(style(), "owner:", ORIGIN);
        expect(bare.sprite).toBeUndefined();
    });

    it("keeps an absolute sprite absolute", () => {
        const fragment = prefixStyleFragment(
            { ...style(), sprite: "https://cdn.test/sprite" },
            "owner:",
            ORIGIN,
        );

        expect(fragment.sprite).toBe("https://cdn.test/sprite");
    });
});
