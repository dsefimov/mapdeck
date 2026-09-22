/** Supported language codes */
export type SupportedLanguage = "en";

/** Flat string map per namespace — no rigid schema */
export type TranslationDict = Record<string, string>;

/** Locale key for the display name of a tool */
export const LOCALE_KEY_TOOL_NAME = "tool.name" as const;

/** Locale key for the display name of a widget */
export const LOCALE_KEY_WIDGET_NAME = "widget.name" as const;

/**
 * Runtime-slice port over the locale subsystem (ADR-0004): what contexts
 * expose to panels and modules.
 */
export interface LocaleApi {
    /** The dictionary of a namespace (empty when unregistered). */
    t(namespace: string): TranslationDict;
    /** Register or replace a namespace dictionary. */
    registerTranslations(namespace: string, dict: TranslationDict): void;
}
