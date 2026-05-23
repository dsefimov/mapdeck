import type { LayerTool } from "@core/framework/types";
import { LayerRoles } from "@core/framework/types";
import { RasterOpacityComponent } from "./Panel";
import { rasterOpacityTranslations } from "../locale";

export const RASTER_OPACITY_SLIDER_ID = "raster-opacity-slider";

export const rasterOpacityTool: LayerTool = {
    id: RASTER_OPACITY_SLIDER_ID,
    role: LayerRoles.RASTER,
    localeTranslations: rasterOpacityTranslations,
    component: (nodeId: string) => <RasterOpacityComponent nodeId={nodeId} />,
};
