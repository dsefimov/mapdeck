import type { TranslationDict } from "@core/contracts";

const en = {
    "widget.name": "Layer Tree",
    loading: "Loading layers...",
    "error.prefix": "Error:",
    "empty.noMatch": "No matching layers",
    "empty.noLayers": "No layers available",
    "search.placeholder": "Search layers...",
    "aria.search": "Search layers",
    "button.update.title": "Update layers",
    "aria.collapse": "Collapse",
    "aria.expand": "Expand",
    "aria.hideLayer": "Hide layer",
    "aria.showLayer": "Show layer",
    "aria.reportDocument": "Report document",
    "aria.layerType": "Layer type",
    "aria.zoomToExtent": "Zoom to extent",
    "aria.moreOptions": "More options",
    "aria.reports": "Reports",
    "label.reports": "Reports:",
    "aria.openReport": "Open {label} in new tab",
    "aria.downloadReport": "Download {label}",
    "unsupported.unregistered-protocol": "Renderer protocol is not registered",
    "unsupported.empty-source-url": "No data source URL",
};

/** Locale keys of the layer-tree namespace — derived from the en dictionary. */
export type LayerTreeLocaleKey = keyof typeof en;

export const layerTreeTranslations: Partial<
    Record<string, TranslationDict>
> = {
    en,
};
