import type { Protocol } from "@core/contracts";
import { GeoJsonAdapter } from "../shared";
import { createSimpleProtocol } from "../shared/simpleProtocol";

/** Layer config of the tiled GeoJSON protocol. */
type GeoJsonTiledConfig = {
    type: "geojson-tiled";
    url: string;
    layerType: "fill" | "line" | "circle";
    paint: Record<string, unknown>;
    opacity: number;
};

/** Tiled GeoJSON through the shared geojson adapter. */
export function createGeoJsonTiledProtocol(): Protocol<GeoJsonTiledConfig> {
    return createSimpleProtocol<GeoJsonTiledConfig>({
        id: "geojson-tiled",
        label: "GeoJSON Tiled",
        defaultStyle: {
            type: "fill",
            paint: { "fill-opacity": 1 },
        },
        adapter: new GeoJsonAdapter(),
        buildConfig: ({ sourceUrl, style }) => ({
            type: "geojson-tiled",
            url: sourceUrl,
            layerType: (style.type as GeoJsonTiledConfig["layerType"]) ?? "fill",
            paint: style.paint ?? {},
            opacity:
                (style.paint?.["fill-opacity"] as number | undefined) ?? 1,
        }),
    });
}
