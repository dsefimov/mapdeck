/**
 * Technical part of the single access point: common subsystems only.
 * Technical stores (locale/settings/widget/state) receive this as `rootStore`
 * — the common layer does not know about domains.
 */
import type { LocaleStore } from "./locale/LocaleStore";
import type { SettingsStore } from "./settings/SettingsStore";
import type { StateStore } from "@core/lib/state/StateStore";
import type { WidgetStore } from "./widget/WidgetStore";

export interface CommonRegistry {
    readonly settingsStore: SettingsStore;
    readonly stateStore: StateStore;
    readonly widgetStore: WidgetStore;
    readonly localeStore: LocaleStore;
}
