import type React from "react";
import type { LayerTool } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import { logger } from "@core/lib/logger";
import { ViewAttributeTableComponent } from "./Panel";
import { viewAttributeTableTranslations } from "../locale";

export const VIEW_ATTRIBUTE_TABLE_ID = "view-attribute-table";

/**
 * The widget this tool opens, by id string — cross-kind imports are
 * forbidden, so the target is named locally (the ADR-0007 link-by-id
 * precedent) and its existence is verified at registration.
 */
export const ATTRIBUTE_TABLE_WIDGET_ID = "attribute-table-widget";

/** In-map attribute table for a layer's data source (WFS, OGC features). */
export class ViewAttributeTableTool implements LayerTool {
    readonly id = VIEW_ATTRIBUTE_TABLE_ID;
    readonly localeTranslations = viewAttributeTableTranslations;

    component(nodeId: string): React.ReactNode {
        return <ViewAttributeTableComponent nodeId={nodeId} />;
    }
}

/** Registers the tool and links it to the attribute data protocols. */
export function registerViewAttributeTableTool(rootStore: StoreRegistry): void {
    if (!rootStore.widgetStore.getWidgetById(ATTRIBUTE_TABLE_WIDGET_ID)) {
        logger.warn(
            `view-attribute-table: target widget "${ATTRIBUTE_TABLE_WIDGET_ID}" is not registered — the tool's button will open nothing.`,
        );
    }
    rootStore.layerToolStore.registerTool(new ViewAttributeTableTool());
    rootStore.layerToolStore.bindToolToProtocol(
        "wfs",
        "data",
        VIEW_ATTRIBUTE_TABLE_ID,
    );
    rootStore.layerToolStore.bindToolToProtocol(
        "ogc-features",
        "data",
        VIEW_ATTRIBUTE_TABLE_ID,
    );
}
