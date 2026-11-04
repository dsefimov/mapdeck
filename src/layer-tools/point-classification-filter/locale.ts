import type { TranslationDict } from "@core/contracts";

const en = {
    "tool.name": "Point Classes",
    "label.classes": "Point classes:",
    "class.0": "Never classified",
    "class.1": "Unclassified",
    "class.2": "Ground",
    "class.3": "Low Vegetation",
    "class.4": "Medium Vegetation",
    "class.5": "High Vegetation",
    "class.6": "Building",
    "class.7": "Low Point (noise)",
    "class.8": "Model Key",
    "class.9": "Water",
    "class.10": "Rail",
    "class.11": "Road Surface",
    "class.12": "Overlap",
    "class.13": "Wire Guard",
    "class.14": "Wire Conductor",
    "class.15": "Transmission Tower",
    "class.16": "Wire Connector",
    "class.17": "Bridge Deck",
    "class.18": "High Noise",
    /** Label for codes outside the LAS table — `{code}` is the raw byte. */
    "label.fallbackClass": "Class {code}",
    "empty.noData": "No classification data loaded yet",
};

/**
 * Locale keys of the point-classification-filter namespace — derived from
 * the en dictionary.
 */
export type PointClassificationFilterLocaleKey = keyof typeof en;

export const pointClassificationFilterTranslations: Partial<
    Record<string, TranslationDict>
> = {
    en,
};
