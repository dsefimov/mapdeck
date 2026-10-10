import type { TranslationDict } from "@core/contracts";

const en = {
    "tool.name": "Point Size",
    "label.pointSize": "Point size: {value} px",
};

/**
 * Locale keys of the point-size-slider namespace — derived from the en
 * dictionary.
 */
export type PointSizeSliderLocaleKey = keyof typeof en;

export const pointSizeSliderTranslations: Partial<
    Record<string, TranslationDict>
> = {
    en,
};
