import type { SupportedLanguage, TranslationDict } from "@core/contracts";

const en = {
    "tool.name": "Point Color Scheme",
    "label.colorBy": "Color by:",
    "scheme.rgb": "RGB/natural colors",
    "scheme.classification": "By classification",
    "scheme.elevation": "By elevation",
    "scheme.intensity": "By intensity",
    "aria.colorScheme": "Color scheme",
};

/**
 * Locale keys of the point-color-scheme namespace — derived from the en
 * dictionary.
 */
export type PointColorSchemeLocaleKey = keyof typeof en;

export const pointColorSchemeTranslations: Partial<
    Record<SupportedLanguage, TranslationDict>
> = {
    en,
};
