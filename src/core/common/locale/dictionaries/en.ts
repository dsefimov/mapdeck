import type {
    SupportedLanguage,
    TranslationDict,
} from "@core/contracts";

const core = {
    // ErrorScreen / InlineError
    "error.title": "Initialization failed",
    "error.retry": "Retry",
    "error.renderTitle": "Something went wrong",

    // The kit's ContextMenu takes its header from its host — map-viewer's
    // own locale carries "contextMenu.header".

    // WidgetShell close button
    "aria.close": "Close",

    // SelectInput empty state
    "select.noOptions": "No options",

    // DataTable — the generic kit's own vocabulary
    "dataTable.show": "Show",
    "dataTable.hide": "Hide",
    "dataTable.clearFilters": "Clear filters",
    "dataTable.noData": "No data available",
    "dataTable.loading": "Loading...",
    "dataTable.yes": "Yes",
    "dataTable.no": "No",
    "dataTable.attribute": "Attribute",
    "dataTable.value": "Value",
    "dataTable.nullValue": "—",
    "dataTable.retry": "Retry",
    "dataTable.filters": "filters",
    "dataTable.filterAttributes": "Filter attributes...",
    "dataTable.filterValues": "Filter values...",
    "dataTable.filterColumn": "Filter {column}...",
    "dataTable.zoomToObject": "Zoom to object",
    "dataTable.rowNumber": "#",

    // WidgetGrid
    "widgetGrid.dragToTop":
        "Drag to top edge to stretch horizontally (full width)",
    "widgetGrid.dragToBottom":
        "Drag to bottom edge to stretch horizontally (full width)",
    "widgetGrid.dragToLeft":
        "Drag to left edge to stretch vertically (full height)",
    "widgetGrid.dragToRight":
        "Drag to right edge to stretch vertically (full height)",
    "widgetGrid.dragToMove": 'Drag to move "{name}"',
    "widgetGrid.close": "Close",
    "widgetGrid.closeLabel": "Close {name}",
};

/**
 * Base framework strings (namespace: 'core').
 * These are the minimal set of strings used by core UI components.
 */
export type CoreLocaleKey = keyof typeof core;

export const coreTranslations: Partial<
    Record<SupportedLanguage, TranslationDict>
> = {
    en: core,
};
