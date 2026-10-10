/**
 * Language codes are open data: "en" is the built-in language the library
 * ships dictionaries for; every other language enters as registered
 * dictionaries through a module. The fallback for a namespace without a
 * registration in the current language is the whole en dictionary.
 */

/** Flat string map per namespace — no rigid schema */
export type TranslationDict = Record<string, string>;

/** Locale key for the display name of a tool */
export const LOCALE_KEY_TOOL_NAME = "tool.name" as const;

/** Locale key for the display name of a widget */
export const LOCALE_KEY_WIDGET_NAME = "widget.name" as const;

/**
 * Runtime read port over the locale subsystem: what tool panels
 * consume. Registration is assembly-time only.
 */
export interface LocaleApi {
    /** The dictionary of a namespace (empty when unregistered). */
    t(namespace: string): TranslationDict;
}

/**
 * Registration view over the locale subsystem: what modules
 * register their translations through. Dictionaries are keyed by language;
 * a registration merges its keys into the dictionaries already registered
 * for the namespace.
 */
export interface LocaleRegistrationPort extends LocaleApi {
    registerTranslations(
        namespace: string,
        dict: Partial<Record<string, TranslationDict>>,
    ): void;
}
