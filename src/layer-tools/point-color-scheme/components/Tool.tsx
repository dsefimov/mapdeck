import type React from "react";
import type { LayerTool } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import { PointColorSchemeComponent } from "./Panel";
import { pointColorSchemeTranslations } from "../locale";

export const POINT_COLOR_SCHEME_SELECTOR_ID = "point-color-scheme-selector";

/** Color scheme selector for point cloud layers. */
export class PointColorSchemeTool implements LayerTool {
    readonly id = POINT_COLOR_SCHEME_SELECTOR_ID;
    readonly localeTranslations = pointColorSchemeTranslations;

    component(nodeId: string): React.ReactNode {
        return <PointColorSchemeComponent nodeId={nodeId} />;
    }
}

/** Registers the tool and links it to the point cloud protocol. */
export function registerPointColorSchemeTool(rootStore: StoreRegistry): void {
    rootStore.layerToolStore.registerTool(new PointColorSchemeTool());
    rootStore.layerToolStore.bindToolToProtocol(
        "copc",
        "renderer",
        POINT_COLOR_SCHEME_SELECTOR_ID,
    );
}
