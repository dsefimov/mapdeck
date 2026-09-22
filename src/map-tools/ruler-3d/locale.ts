import type { SupportedLanguage, TranslationDict } from "@core/contracts";

const en = {
    "tool.name": "Measure 3D Distance",
    eyebrow: "3D Ruler",
    "eyebrow.editMode": "3D Ruler (Edit Mode)",
    "summary.totalDistance": "Total 3D distance:",
    "summary.horizontal": "Horizontal",
    "summary.vertical": "Vertical",
    "summary.points": "Points:",
    "segments.title": "Segment Distances",
    "segment.label": "Point {from} → {to}",
    "segment.horizontal": "Horizontal:",
    "segment.vertical": "Vertical:",
    "button.undo": "Undo (Ctrl+Z)",
    "button.resetAll": "Reset All",
    "button.closeTool": "Close Tool",
    "hint.normal":
        "Click points on the cloud to measure. Middle-click or E to toggle edit mode",
    "hint.editMode":
        "Drag points to adjust. Middle-click or ESC to exit edit mode",
};

/** Locale keys of the ruler-3d namespace — derived from the en dictionary. */
export type Ruler3dLocaleKey = keyof typeof en;

export const ruler3dTranslations: Partial<
    Record<SupportedLanguage, TranslationDict>
> = {
    en,
};
