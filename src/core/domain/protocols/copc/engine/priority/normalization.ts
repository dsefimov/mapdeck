/**
 * Priority normalization: min-max bounds tracking and [0,1] clamping.
 */

/** Bounds for normalizing continuous priority criteria across the visible tile set. */
export interface PriorityBounds {
    minDepth: number;
    maxDepth: number;
    minFoveatedFactor: number;
    maxFoveatedFactor: number;
    minReverseSSE: number;
    maxReverseSSE: number;
}

const EPSILON7 = 1e-7;

/**
 * Highest value a criterion may reach. Anything at 1 or above would survive
 * `isolateDigits` as a full extra digit and carry into the neighbouring group.
 */
const MAX_NORMALIZED = 1 - EPSILON7;

/**
 * Normalize a value into [0, 1) and clamp it there.
 *
 * The upper end is held strictly below 1 so that the base-10 packing in
 * `updatePriority` cannot carry a criterion into the next digit group; a value
 * beyond `maximum` clamps to that same bound rather than to 1. The lower end
 * is exact — the minimum normalizes to 0.
 *
 * A criterion that does not resolve to a number — a projection that failed for
 * one node, which then poisons the shared min/max bounds for all of them —
 * ranks least urgent instead of propagating. Priority feeds a min-heap and a
 * sort comparator, and NaN makes both orderings arbitrary, so a single bad node
 * would otherwise scramble the load order of every good one.
 */
export function priorityNormalizeAndClamp(
    value: number,
    minimum: number,
    maximum: number,
): number {
    if (minimum === maximum) return 0.0;
    const normalized = (value - minimum) / (maximum - minimum);
    if (Number.isNaN(normalized)) return MAX_NORMALIZED;
    return Math.max(0.0, Math.min(MAX_NORMALIZED, normalized - EPSILON7));
}

/** Criteria collected for one visited node, folded into `PriorityBounds`. */
export interface PrioritySample {
    depth: number;
    foveatedFactor: number;
    reverseSSE: number;
}

/** Fold one node's criteria into the traversal-wide min/max bounds. */
export function accumulatePriorityBounds(
    bounds: PriorityBounds,
    sample: PrioritySample,
): void {
    bounds.minDepth = Math.min(bounds.minDepth, sample.depth);
    bounds.maxDepth = Math.max(bounds.maxDepth, sample.depth);
    bounds.minFoveatedFactor = Math.min(
        bounds.minFoveatedFactor,
        sample.foveatedFactor,
    );
    bounds.maxFoveatedFactor = Math.max(
        bounds.maxFoveatedFactor,
        sample.foveatedFactor,
    );
    bounds.minReverseSSE = Math.min(bounds.minReverseSSE, sample.reverseSSE);
    bounds.maxReverseSSE = Math.max(bounds.maxReverseSSE, sample.reverseSSE);
}
