import type { TranslationDict } from "@core/contracts";

const en = {
    "widget.name": "Settings",
    "empty.noSettings": "No settings registered yet.",
    "validation.range": "Value must be between {min} and {max}",
    "validation.type": "Invalid value type",
    "validation.select": "Value is not among the allowed options",
    "validation.notfound": "This setting is no longer registered",
    "action.resetAll": "Reset to defaults",
};

/** Locale keys of the settings namespace — derived from the en dictionary. */
export type SettingsLocaleKey = keyof typeof en;

export const settingsTranslations: Partial<
    Record<string, TranslationDict>
> = {
    en,
};
