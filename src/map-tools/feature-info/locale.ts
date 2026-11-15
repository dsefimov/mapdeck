import type { TranslationDict } from "@core/contracts";

const en = {
    "tool.name": "Feature Info",
    eyebrow: "Feature Info",
    instructions: "Click on the map to get information about objects",
    noClickYet: "No click yet. Click anywhere on the map.",
    noFeatures: "No features found at this location",
    "layer.label": "Layer:",
    "select.placeholder": "No features found",
    "button.close": "Close",
    "provider.notAvailable":
        "Feature info is not available for this layer type",
};

/**
 * Locale keys of the feature-info namespace — derived from the en dictionary.
 */
export type FeatureInfoLocaleKey = keyof typeof en;

export const featureInfoTranslations: Partial<
    Record<string, TranslationDict>
> = {
    en,
};
