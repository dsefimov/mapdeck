import { describe, expect, it } from "vitest";
import type { BaseMapConfig } from "@core/contracts";
import { applyTileOverrides } from "./registerBasemaps";

function rasterBasemap(id: string, tiles: string[]): BaseMapConfig {
    return {
        id,
        name: id,
        style: {
            version: 8,
            sources: {
                main: {
                    // The baked configs' shape; the cast keeps the test free
                    // of full MapLibre style boilerplate.
                    type: "raster",
                    tiles,
                    tileSize: 256,
                } as NonNullable<BaseMapConfig["style"]>["sources"][string],
            },
            layers: [],
        },
    };
}

describe("applyTileOverrides", () => {
    it("replaces the raster tiles of the matching basemap only", () => {
        const osm = rasterBasemap("osm_standard", [
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        ]);
        const esri = rasterBasemap("esri_world_imagery", [
            "https://server.arcgisonline.com/tile/{z}/{y}/{x}",
        ]);

        applyTileOverrides([osm, esri], {
            osm_standard: ["https://cache.internal/osm/{z}/{x}/{y}.png"],
        });

        const osmSource = osm.style!.sources.main as { tiles: string[] };
        const esriSource = esri.style!.sources.main as { tiles: string[] };
        expect(osmSource.tiles).toEqual([
            "https://cache.internal/osm/{z}/{x}/{y}.png",
        ]);
        expect(esriSource.tiles).toEqual([
            "https://server.arcgisonline.com/tile/{z}/{y}/{x}",
        ]);
    });

    it("leaves basemaps without tile sources and unknown ids alone", () => {
        const styled = rasterBasemap("osm_standard", ["https://a/{z}/{x}/{y}"]);
        const base = styled.style!;
        styled.style = { ...base, sources: {} };
        const vectorOnly: BaseMapConfig = { id: "vec", name: "vec" };

        applyTileOverrides([styled, vectorOnly], {
            vec: ["https://ignored/{z}/{x}/{y}"],
            missing_id: ["https://also-ignored/{z}/{x}/{y}"],
        });

        expect(styled.style!.sources).toEqual({});
        expect(vectorOnly.style).toBeUndefined();
    });
});
