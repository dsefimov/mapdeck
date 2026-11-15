
/**
 * Grid layout configuration in grid units
 */
export const WIDGET_GRID_CONFIG = {
    COLUMNS: 80,
    ROWS: 45,
    DEFAULT_WIDTH: 20,
    DEFAULT_HEIGHT: 15,
    DEFAULT_MIN_WIDTH: 5,
    DEFAULT_MIN_HEIGHT: 5,
    DEFAULT_MAX_WIDTH: 40,
    DEFAULT_MAX_HEIGHT: 30,
} as const;

/**
 * Default widget size with all fallbacks applied
 */
/**
 * Resolved widget size with all defaults applied (no nullable fields).
 * Uses react-grid-layout compatible property names — owned by the widget
 * subsystem, the only consumer.
 */
export interface WidgetSize {
    defaultWidth: number;
    defaultHeight: number;
    minW: number;
    minH: number;
    maxW: number;
    maxH: number;
}

export const WIDGET_GRID_DEFAULT_SIZE: WidgetSize = {
    defaultWidth: WIDGET_GRID_CONFIG.DEFAULT_WIDTH,
    defaultHeight: WIDGET_GRID_CONFIG.DEFAULT_HEIGHT,
    minW: WIDGET_GRID_CONFIG.DEFAULT_MIN_WIDTH,
    minH: WIDGET_GRID_CONFIG.DEFAULT_MIN_HEIGHT,
    maxW: WIDGET_GRID_CONFIG.DEFAULT_MAX_WIDTH,
    maxH: WIDGET_GRID_CONFIG.DEFAULT_MAX_HEIGHT,
};

export interface GridPosition {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Clamps a grid item into the grid rectangle with the top-left corner
 * anchored: the position is sanitized first, then the size is trimmed to
 * whatever space remains below/right of it. Pure.
 */
export function clampLayoutItem<T extends GridPosition>(
    item: T,
    cols: number,
    rows: number,
): T {
    const x = Math.max(0, Math.min(item.x, cols - 1));
    const y = Math.max(0, Math.min(item.y, rows - 1));
    return {
        ...item,
        x,
        y,
        w: Math.max(1, Math.min(item.w, cols - x)),
        h: Math.max(1, Math.min(item.h, rows - y)),
    };
}
