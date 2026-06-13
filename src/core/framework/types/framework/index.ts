export type { SupportedLanguage, TranslationDict } from "./locale";
export { DEFAULT_LANGUAGE } from "./locale";

export type { Widget, WidgetComponent, WidgetContext } from "./widget";
export type {
    WidgetSizeConfig,
    WidgetBaseConfig,
    WidgetConfig,
    WidgetSize,
} from "./widgetConfig";
export type { Module } from "./module";
export type {
    SettingType,
    SettingOption,
    SettingMetadata,
    RegisteredSetting,
    SettingsGroup,
} from "./settings";

export type { OverlayConfig, ManagedLayer, OverlayManager } from "./overlay";

export type {
    MapTool,
    MapActionTool,
    AnyMapTool,
    MapToolComponentProps,
    MapToolPlacement,
    BaseMapTool,
    ContextMenuBehavior,
} from "./tools";
export { isMapTool, isMapActionTool } from "./tools";
