import type { Widget, WidgetSizeConfig } from "@core/contracts";
import { readWidgetConfig } from "@core/contracts";
import icon from "@core/ui/icons/map.svg";
import { mapViewerTranslations } from "./locale";
import MapViewerComponent from "./components/Widget";
import type { MapViewerProps } from "./types";
import config from "./config.json";

export const MAP_VIEWER_ID = "map-viewer" as const;

/** The map viewer widget: the MapLibre canvas with the tools overlay. */
export class MapViewerWidget implements Widget<MapViewerProps> {
    readonly id = MAP_VIEWER_ID;
    readonly icon = icon;
    readonly localeTranslations = mapViewerTranslations;
    readonly component = MapViewerComponent;
    readonly showInSidebar: boolean;
    readonly size?: WidgetSizeConfig;

    constructor() {
        const { showInSidebar, size } = readWidgetConfig(
            MAP_VIEWER_ID,
            config,
        );
        this.showInSidebar = showInSidebar;
        if (size) {
            this.size = size;
        }
    }
}

export default MapViewerWidget;
