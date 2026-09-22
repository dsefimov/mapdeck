/** Default streaming budget constants — single source of truth. */

/** Maximum allowed screen-space error in pixels. */
export const DEFAULT_MAX_SCREEN_ERROR_PX = 1.0;

/** Maximum total points kept in memory across all loaded nodes. */
export const DEFAULT_POINT_BUDGET = 40_000_000;

/**
 * Hard ceiling for one HTTP range request of node data. A hung server must
 * release its load slot, not hold one of the four forever.
 */
export const DEFAULT_RANGE_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Hard ceiling for one worker request (decode, recolor). On expiry the slot
 * recovers with a fresh worker — a wedged instance is terminated.
 */
export const DEFAULT_WORKER_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Octree depth ceiling for traversal. Also the fallback when a traversal runs
 * without an explicit depth — one value, so the fallback cannot lag the
 * production loader default.
 */
export const DEFAULT_MAX_OCTREE_DEPTH = 20;

/** Runtime-adjustable baseline for SSE-based LOD (maxScreenErrorPx, pointBudget). */
export interface EffectiveBaseline {
    pointBudget: number;
    maxScreenErrorPx: number;
}
