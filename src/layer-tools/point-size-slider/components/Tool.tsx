import type React from "react";
import type { LayerTool } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import { PointSizeSliderComponent } from "./Panel";
import { pointSizeSliderTranslations } from "../locale";

export const POINT_SIZE_SLIDER_ID = "point-size-slider";

/** Point size slider for point cloud layers. */
export class PointSizeSliderTool implements LayerTool {
    readonly id = POINT_SIZE_SLIDER_ID;
    readonly localeTranslations = pointSizeSliderTranslations;

    component(nodeId: string): React.ReactNode {
        return <PointSizeSliderComponent nodeId={nodeId} />;
    }
}

/** Registers the tool and links it to the point cloud protocol. */
export function registerPointSizeTool(rootStore: StoreRegistry): void {
    rootStore.layerToolStore.registerTool(new PointSizeSliderTool());
    rootStore.layerToolStore.bindToolToProtocol(
        "copc",
        "renderer",
        POINT_SIZE_SLIDER_ID,
    );
}
