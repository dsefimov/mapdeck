import type { TranslationDict } from "@core/contracts";

const en = {
    "tool.name": "Measure Volume",
    eyebrow: "Volume Measure",
    "summary.fillVolume": "Fill volume:",
    "summary.cutVolume": "Cut volume:",
    "summary.surfaceArea": "Surface area:",
    "summary.baseZ": "Base Z:",
    "summary.surfaceZ": "Surface Z:",
    "summary.cloudPoints": "Cloud points:",
    "button.resetAll": "Reset All",
    "button.closeTool": "Close Tool",
    "hint.normal": "Click to draw boundary. Middle-click or Enter to complete",
    "hint.complete": "Boundary complete. ESC to reset",
};

/**
 * Locale keys of the volume-measure namespace — derived from the en
 * dictionary.
 */
export type VolumeMeasureLocaleKey = keyof typeof en;

export const volumeMeasureTranslations: Partial<
    Record<string, TranslationDict>
> = {
    en,
};
