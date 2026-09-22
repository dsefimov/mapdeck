import { createTechLayerTool, createMeasureController } from "@map-tools/shared/createTechLayerTool";
import { AreaMeasureComponent } from "./Panel";
import { areaMeasureTranslations } from "../locale";

export const AREA_MEASURE_ID = "area-measure";

export const AreaMeasureTool = createTechLayerTool({
    id: AREA_MEASURE_ID,
    icon: "area",
    localeTranslations: areaMeasureTranslations,
    createController: createMeasureController(AREA_MEASURE_ID, "polygon"),
    panel: AreaMeasureComponent,
});
