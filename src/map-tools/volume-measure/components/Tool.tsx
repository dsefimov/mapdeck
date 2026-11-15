import { createTechLayerTool } from "@map-tools/shared/createTechLayerTool";
import { VolumeMeasureComponent } from "./Panel";
import { volumeMeasureTranslations } from "../locale";
import { VolumeMeasureController, VOLUME_LAYER_PREFIX } from "../controller";

export const VolumeMeasureTool = createTechLayerTool({
    id: VOLUME_LAYER_PREFIX,
    icon: "volume",
    localeTranslations: volumeMeasureTranslations,
    createController: (store) => new VolumeMeasureController(store),
    panel: VolumeMeasureComponent,
});
