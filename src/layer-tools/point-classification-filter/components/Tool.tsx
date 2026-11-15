import type React from "react";
import type { LayerTool } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import { PointClassificationFilterComponent } from "./Panel";
import { pointClassificationFilterTranslations } from "../locale";

export const POINT_CLASSIFICATION_FILTER_ID = "point-classification-filter";

/** Per-class visibility toggles for point cloud layers. */
export class PointClassificationFilterTool implements LayerTool {
    readonly id = POINT_CLASSIFICATION_FILTER_ID;
    readonly localeTranslations = pointClassificationFilterTranslations;

    component(nodeId: string): React.ReactNode {
        return <PointClassificationFilterComponent nodeId={nodeId} />;
    }
}

/** Registers the tool and links it to the point cloud protocol. */
export function registerPointClassificationFilterTool(
    rootStore: StoreRegistry,
): void {
    rootStore.layerToolStore.registerTool(
        new PointClassificationFilterTool(),
    );
    rootStore.layerToolStore.bindToolToProtocol(
        "copc",
        "renderer",
        POINT_CLASSIFICATION_FILTER_ID,
    );
}
