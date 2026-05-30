import type { LayerTool } from "@core/framework/types";
import { LayerRoles } from "@core/framework/types";
import { VectorColorPickerComponent } from "./Panel";
import { vectorColorPickerTranslations } from "../locale";

export const VECTOR_COLOR_PICKER_ID = "vector-color-picker";

export const vectorColorPickerTool: LayerTool = {
    id: VECTOR_COLOR_PICKER_ID,
    role: [LayerRoles.VECTOR, LayerRoles.GEOJSON],
    localeTranslations: vectorColorPickerTranslations,
    component: (nodeId: string) => (
        <VectorColorPickerComponent nodeId={nodeId} />
    ),
};
