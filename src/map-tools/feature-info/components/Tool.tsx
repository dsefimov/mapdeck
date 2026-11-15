import React from "react";
import { MAP_TOOL_KIND } from "@core/contracts";
import type {
    ContextMenuBehavior,
    InteractiveMapTool,
    MapToolComponentProps,
} from "@core/contracts";
import { FeatureInfoComponent } from "./Panel";
import { FeatureInfoStore } from "../utils/FeatureInfoStore";
import { featureInfoTranslations } from "../locale";

/**
 * MapTool implementation for feature information.
 * Click on the map to get information about objects at the clicked location.
 */
export class FeatureInfoTool implements InteractiveMapTool {
    readonly id = "feature-info";
    readonly icon = "info";
    readonly kind = MAP_TOOL_KIND.interactive;
    readonly contextMenu: ContextMenuBehavior = { mode: "activate-at-point" };
    readonly localeTranslations = featureInfoTranslations;

    readonly component: React.ComponentType<MapToolComponentProps> = (
        props,
    ) => {
        const store = props.context.stateStore.get(this.id, () => new FeatureInfoStore());
        return <FeatureInfoComponent {...props} store={store} />;
    };
}
