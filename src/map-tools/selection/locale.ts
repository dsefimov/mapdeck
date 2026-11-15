import type { TranslationDict } from "@core/contracts";

const en = {
    "tool.name": "Select Features",
    eyebrow: "Select Features",
    instructions:
        "Click or drag a rectangle on the map to select features of the target layer",
    "target.label": "Layer",
    "target.placeholder": "Choose a layer",
    "target.noLayers": "No selectable layers on the map",
    "mode.label": "Mode",
    "mode.new": "New",
    "mode.add": "Add",
    "mode.remove": "Remove",
    "list.header": "Selection",
    "list.empty": "Nothing selected yet",
    "list.unstableIds":
        "This layer's features carry no id field — the selection will not sync with the attribute table",
    "action.zoom": "Zoom to layer selection",
    "action.clearLayer": "Clear layer selection",
    "action.viewInTable": "Show in attribute table",
    "button.clearAll": "Clear all",
    "button.close": "Close",
    "selection.color": "Selection color",
};

/** Locale keys of the selection namespace — derived from the en dictionary. */
export type SelectionLocaleKey = keyof typeof en;

export const selectionTranslations: Partial<
    Record<string, TranslationDict>
> = {
    en,
};
