import type { SupportedLanguage, TranslationDict } from "@core/contracts";

export const attributeTableTranslations: Partial<
    Record<SupportedLanguage, TranslationDict>
> = {
    en: {
        "widget.name": "Attribute Table",
        "layerSelector.label": "Layer",
        "layerSelector.placeholder": "— Select a layer —",
        "aria.layerSelect": "Select layer for attribute table",
        "empty.noLayers": "No layers with WFS attribute data available",
    },
};
