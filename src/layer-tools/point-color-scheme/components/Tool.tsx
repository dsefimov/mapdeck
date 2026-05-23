import type { LayerTool } from "@core/framework/types";
import { LayerRoles } from "@core/framework/types";
import { PointColorSchemeComponent } from "./Panel";
import { pointColorSchemeTranslations } from "../locale";

export const POINT_COLOR_SCHEME_SELECTOR_ID = "point-color-scheme-selector";

export const pointColorSchemeTool: LayerTool = {
    id: POINT_COLOR_SCHEME_SELECTOR_ID,
    role: LayerRoles.POINT_CLOUD,
    localeTranslations: pointColorSchemeTranslations,
    component: (nodeId: string) => (
        <PointColorSchemeComponent nodeId={nodeId} />
    ),
};
