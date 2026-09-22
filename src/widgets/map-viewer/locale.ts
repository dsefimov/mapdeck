import type { SupportedLanguage, TranslationDict } from "@core/contracts";

export const mapViewerTranslations: Partial<
    Record<SupportedLanguage, TranslationDict>
> = {
    en: {
        "widget.name": "Map Viewer",
        "contextMenu.header": "Map Tools",
    },
};
