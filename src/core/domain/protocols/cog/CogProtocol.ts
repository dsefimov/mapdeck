import type { Protocol } from "@core/contracts";
import { RasterAdapter } from "../shared";
import { styleNumber } from "../logic/styleValues";
import { createSimpleProtocol } from "../shared/simpleProtocol";

/** Layer config of the COG protocol. */
type CogConfig = {
    type: "cog";
    url: string;
    opacity: number;
};

/** Cloud-Optimized GeoTIFF through the shared raster adapter. */
export function createCogProtocol(): Protocol<CogConfig> {
    return createSimpleProtocol<CogConfig>({
        id: "cog",
        label: "Cloud Optimized GeoTIFF",
        defaultStyle: { paint: { "raster-opacity": 1 } },
        adapter: new RasterAdapter(),
        buildConfig: ({ sourceUrl, style }) => ({
            type: "cog",
            url: sourceUrl,
            opacity: styleNumber(style.paint?.["raster-opacity"], 1),
        }),
    });
}
