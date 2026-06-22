/** Default streaming budget constants — single source of truth. */

/** Maximum allowed screen-space error in pixels. */
export const DEFAULT_MAX_SCREEN_ERROR_PX = 1.0;

/** Maximum total points kept in memory across all loaded nodes. */
export const DEFAULT_POINT_BUDGET = 40_000_000;

/** Runtime-adjustable baseline for SSE-based LOD (maxScreenErrorPx, pointBudget). */
export interface EffectiveBaseline {
    pointBudget: number;
    maxScreenErrorPx: number;
}
