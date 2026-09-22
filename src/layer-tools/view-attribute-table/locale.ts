import type { SupportedLanguage, TranslationDict } from "@core/contracts";

export const viewAttributeTableTranslations: Partial<
    Record<SupportedLanguage, TranslationDict>
> = {
    en: {
        "tool.name": "Attribute Table",
        "label.button": "Attribute Table",
        "aria.button": "View attribute table",
    },
};
