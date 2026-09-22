import type React from "react";
import type { LayerTool } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import { RasterOpacityComponent } from "./Panel";
import { rasterOpacityTranslations } from "../locale";

export const RASTER_OPACITY_SLIDER_ID = "raster-opacity-slider";

/** Opacity slider for raster layers (WMS, XYZ, COG). */
export class RasterOpacityTool implements LayerTool {
    readonly id = RASTER_OPACITY_SLIDER_ID;
    readonly localeTranslations = rasterOpacityTranslations;

    component(nodeId: string): React.ReactNode {
        return <RasterOpacityComponent nodeId={nodeId} />;
    }
}

/** Registers the tool and links it to the raster protocols it applies to. */
export function registerRasterOpacityTool(rootStore: StoreRegistry): void {
    rootStore.layerToolStore.registerTool(new RasterOpacityTool());
    rootStore.layerToolStore.bindToolToProtocol(
        "wms",
        "renderer",
        RASTER_OPACITY_SLIDER_ID,
    );
    rootStore.layerToolStore.bindToolToProtocol(
        "xyz",
        "renderer",
        RASTER_OPACITY_SLIDER_ID,
    );
    rootStore.layerToolStore.bindToolToProtocol(
        "cog",
        "renderer",
        RASTER_OPACITY_SLIDER_ID,
    );
}
