import type { SupportedLanguage, TranslationDict } from "@core/contracts";

const en = {
    "tool.name": "Raster Opacity",
    "label.opacity": "Opacity: {percent}%",
};

/**
 * Locale keys of the raster-opacity namespace — derived from the en
 * dictionary.
 */
export type RasterOpacityLocaleKey = keyof typeof en;

export const rasterOpacityTranslations: Partial<
    Record<SupportedLanguage, TranslationDict>
> = {
    en,
};
