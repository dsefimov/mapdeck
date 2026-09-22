import type { Widget, WidgetSizeConfig } from "@core/contracts";
import { readWidgetConfig } from "@core/contracts";
import { sidebarTranslations } from "./locale";
import SidebarComponent from "./components/Widget";
import type { SidebarProps } from "./types";
import config from "./config.json";

export const SIDEBAR_ID = "sidebar-widget" as const;

/** The sidebar widget: the launcher for the grid widgets. */
export class SidebarWidget implements Widget<SidebarProps> {
    readonly id = SIDEBAR_ID;
    readonly icon = "";
    readonly localeTranslations = sidebarTranslations;
    readonly component = SidebarComponent;
    readonly showInSidebar: boolean;
    readonly size?: WidgetSizeConfig;

    constructor() {
        const { showInSidebar, size } = readWidgetConfig(
            SIDEBAR_ID,
            config,
        );
        this.showInSidebar = showInSidebar;
        if (size) {
            this.size = size;
        }
    }
}

export default SidebarWidget;
