import type { LayoutItem } from "react-grid-layout";
import { collides } from "react-grid-layout/core";
import type { StoredWidget } from "@core/contracts";
import type { WidgetSize } from "./layout";
import { WIDGET_GRID_CONFIG, WIDGET_GRID_DEFAULT_SIZE } from "./layout";

/** Grid configuration for react-grid-layout */
export const GRID_CONFIG = {
    cols: WIDGET_GRID_CONFIG.COLUMNS,
    rows: WIDGET_GRID_CONFIG.ROWS,
    defaultWidth: WIDGET_GRID_CONFIG.DEFAULT_WIDTH,
    defaultHeight: WIDGET_GRID_CONFIG.DEFAULT_HEIGHT,
    rowHeight: 30,
    margin: [10, 10] as const,
    containerPadding: [0, 0] as const,
};

/**
 * Get widget size from its definition (with defaults as fallback).
 * A widget with `size: "auto"` falls back to the default size — its actual
 * size is derived from the content at render time.
 */
export function getWidgetSize(widgetDef: StoredWidget | undefined): WidgetSize {
    const size: WidgetSize = { ...WIDGET_GRID_DEFAULT_SIZE };

    if (widgetDef?.size && widgetDef.size !== "auto") {
        size.defaultWidth = widgetDef.size.defaultWidth ?? size.defaultWidth;
        size.defaultHeight = widgetDef.size.defaultHeight ?? size.defaultHeight;
        size.minW = widgetDef.size.minWidth ?? size.minW;
        size.minH = widgetDef.size.minHeight ?? size.minH;
        size.maxW = widgetDef.size.maxWidth ?? size.maxW;
        size.maxH = widgetDef.size.maxHeight ?? size.maxH;
    }

    return size;
}

/** Build a grid item for `widgetId` at an explicit position. */
function toLayoutItem(
    widgetId: string,
    size: WidgetSize,
    x: number,
    y: number,
): LayoutItem {
    return {
        i: widgetId,
        x,
        y,
        w: size.defaultWidth,
        h: size.defaultHeight,
        minW: size.minW,
        minH: size.minH,
        maxW: size.maxW,
        maxH: size.maxH,
    };
}

/** Whether the item overlaps any existing layout item. */
function collidesWithAny(
    candidate: LayoutItem,
    existingLayouts: LayoutItem[],
): boolean {
    return existingLayouts.some((item) => collides(candidate, item));
}

/**
 * Find a free position on the grid that doesn't collide with existing items.
 */
export function findFreePosition(
    size: WidgetSize,
    widgetId: string,
    existingLayouts: LayoutItem[],
): LayoutItem | null {
    const candidate = toLayoutItem(widgetId, size, 0, 0);

    for (
        let y = 0;
        y <= WIDGET_GRID_CONFIG.ROWS - size.defaultHeight;
        y++
    ) {
        for (
            let x = 0;
            x <= WIDGET_GRID_CONFIG.COLUMNS - size.defaultWidth;
            x++
        ) {
            candidate.x = x;
            candidate.y = y;

            if (!collidesWithAny(candidate, existingLayouts)) {
                return { ...candidate };
            }
        }
    }

    return null;
}

/**
 * Create a default layout for a widget, trying to find a free position first.
 */
export function createDefaultLayout(
    widgetId: string,
    existingLayouts: LayoutItem[],
    getWidget: (id: string) => StoredWidget | undefined,
): LayoutItem {
    const size = getWidgetSize(getWidget(widgetId));
    return (
        findFreePosition(size, widgetId, existingLayouts) ??
        fallbackLayout(widgetId, size)
    );
}

/** Zero-position fallback for a full grid, dimensions clamped into [min, max]. */
function fallbackLayout(widgetId: string, size: WidgetSize): LayoutItem {
    return {
        i: widgetId,
        x: 0,
        y: 0,
        w: Math.max(size.minW, Math.min(size.defaultWidth, size.maxW)),
        h: Math.max(size.minH, Math.min(size.defaultHeight, size.maxH)),
        minW: size.minW,
        minH: size.minH,
        maxW: size.maxW,
        maxH: size.maxH,
    };
}
