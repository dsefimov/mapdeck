import React from "react";
import { MAP_TOOL_KIND } from "@core/contracts";
import type {
    InteractiveMapTool,
    MapToolComponentProps,
    SettingMetadata,
} from "@core/contracts";
import {
    DEFAULT_SELECTION_COLOR,
    SELECTION_COLOR_SETTING_ID,
} from "@core/common/selection";
import { SelectionComponent } from "./Panel";
import { SelectionToolStore } from "../utils/SelectionToolStore";
import { selectionTranslations } from "../locale";

/** The tool's id — locale namespace, toolbar key and stateStore key. */
export const SELECTION_TOOL_ID = "selection";

const settings: SettingMetadata[] = [
    {
        id: SELECTION_COLOR_SETTING_ID,
        label: "Selection color",
        type: "color",
        defaultValue: DEFAULT_SELECTION_COLOR,
    },
];

/**
 * MapTool implementation for feature selection. Click picks the target
 * layer's feature under the cursor, a drag selects everything inside the
 * rectangle; the panel carries the target layer, the combine mode and
 * per-layer counts.
 */
export class SelectionTool implements InteractiveMapTool {
    readonly id = SELECTION_TOOL_ID;
    readonly icon = "select";
    readonly kind = MAP_TOOL_KIND.interactive;
    readonly localeTranslations = selectionTranslations;
    readonly settings = settings;

    readonly component: React.ComponentType<MapToolComponentProps> = (
        props,
    ) => {
        const store = props.context.stateStore.get(
            this.id,
            () => new SelectionToolStore(),
        );
        return <SelectionComponent {...props} store={store} />;
    };
}
