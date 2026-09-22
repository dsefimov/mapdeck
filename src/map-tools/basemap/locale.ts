import type { SupportedLanguage, TranslationDict } from "@core/contracts";

export const basemapTranslations: Partial<
    Record<SupportedLanguage, TranslationDict>
> = {
    en: {
        "tool.name": "Basemap",
        "panel.title": "Basemap",
        "settings.label": "Basemap",
        "status.unavailable": "Unavailable",
    },
};
