import type { Widget, WidgetSizeConfig } from "@core/contracts";
import { readWidgetConfig } from "@core/contracts";
import icon from "@core/ui/icons/settings.svg";
import { settingsTranslations } from "./locale";
import SettingsWidgetComponent from "./components/Widget";
import type { SettingsWidgetProps } from "./types";
import config from "./config.json";

export const SETTINGS_ID = "settings-widget" as const;

/** The settings widget: per-extension setting controls. */
export class SettingsWidget implements Widget<SettingsWidgetProps> {
    readonly id = SETTINGS_ID;
    readonly icon = icon;
    readonly localeTranslations = settingsTranslations;
    readonly component = SettingsWidgetComponent;
    readonly showInSidebar: boolean;
    readonly size?: WidgetSizeConfig;

    constructor() {
        const { showInSidebar, size } = readWidgetConfig(
            SETTINGS_ID,
            config,
        );
        this.showInSidebar = showInSidebar;
        if (size) {
            this.size = size;
        }
    }
}

export default SettingsWidget;
