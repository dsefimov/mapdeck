import type { Protocol } from "@core/contracts";
import { RasterAdapter } from "../shared";
import { styleNumber } from "../logic/styleValues";
import { createSimpleProtocol } from "../shared/simpleProtocol";

/** Layer config of the XYZ protocol. */
type XyzConfig = {
    type: "xyz";
    url: string;
    opacity: number;
    /** Tile pyramid top level — MapLibre overzooms parent tiles beyond it. */
    maxzoom?: number;
};

/** XYZ raster tiles through the shared raster adapter. */
export function createXyzProtocol(): Protocol<XyzConfig> {
    return createSimpleProtocol<XyzConfig>({
        id: "xyz",
        label: "XYZ Tiles",
        defaultStyle: { paint: { "raster-opacity": 1 } },
        adapter: new RasterAdapter(),
        buildConfig: ({ sourceUrl, style, params }) => {
            const maxzoom =
                typeof params.maxzoom === "number" && params.maxzoom > 0
                    ? params.maxzoom
                    : undefined;
            const opacity = styleNumber(
                style.paint?.["raster-opacity"],
                1,
            );
            return {
                type: "xyz",
                url: sourceUrl,
                opacity,
                ...(maxzoom !== undefined ? { maxzoom } : {}),
            };
        },
    });
}
