/**
 * First-frame fallback for the virtualization math, before a real row
 * exists to measure. The CSS (padding/line-height/border in
 * AttributeTable.module.css) is the single source of truth — the virtual
 * window measures a rendered row and takes over. Matches today's CSS:
 * 2 × --space-8 + 12px body × 1.5 line-height + 1px border.
 */
export const ROW_HEIGHT = 35;
export const BUFFER_SIZE = 10;
export const PRELOAD_BUFFER_ROWS = 100;
export const GLOBAL_FILTER_KEY = "_global";
export const DEFAULT_CONTAINER_HEIGHT = 360;
