import type { Widget } from "@core/contracts";
import { mapToolbarTranslations } from "./locale";
import ToolbarComponent from "./components/Toolbar";
import type { ToolbarProps } from "./types";

export const MAP_TOOLBAR_ID = "map-toolbar" as const;

/** The map toolbar widget: fixed buttons over the map for every map tool. */
export class MapToolbarWidget implements Widget<ToolbarProps> {
    readonly id = MAP_TOOLBAR_ID;
    readonly icon = "";
    readonly placement = "map-toolbar" as const;
    readonly fixed = true;
    readonly size = "auto" as const;
    readonly showInSidebar = false;
    readonly localeTranslations = mapToolbarTranslations;
    readonly component = ToolbarComponent;
}

export default MapToolbarWidget;
