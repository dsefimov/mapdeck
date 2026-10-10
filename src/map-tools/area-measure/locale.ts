import type { TranslationDict } from "@core/contracts";

const en = {
    "tool.name": "Measure Area",
    eyebrow: "Area Measure",
    "eyebrow.editMode": "Area Measure (Edit Mode)",
    "summary.area": "Area:",
    "summary.perimeter": "Perimeter:",
    "summary.vertices": "Vertices:",
    "segments.title": "Edge Distances",
    "segment.label": "Vertex {from} → {to}",
    "button.undo": "Undo (Ctrl+Z)",
    "button.resetAll": "Reset All",
    "button.closeTool": "Close Tool",
    "hint.normal":
        "Click points on the cloud to add vertices. Middle-click or E to toggle edit mode",
    "hint.editMode":
        "Drag points to adjust. Middle-click or ESC to exit edit mode",
};

/** Locale keys of the area-measure namespace — derived from the en dictionary. */
export type AreaMeasureLocaleKey = keyof typeof en;

export const areaMeasureTranslations: Partial<
    Record<string, TranslationDict>
> = {
    en,
};
