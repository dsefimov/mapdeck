import { createTechLayerTool, createMeasureController } from "@map-tools/shared/createTechLayerTool";
import { Ruler3DComponent } from "./Panel";
import { ruler3dTranslations } from "../locale";

export const RULER_3D_ID = "ruler-3d";

export const Ruler3DTool = createTechLayerTool({
    id: RULER_3D_ID,
    icon: "ruler",
    localeTranslations: ruler3dTranslations,
    createController: createMeasureController(RULER_3D_ID, "polyline"),
    panel: Ruler3DComponent,
});
