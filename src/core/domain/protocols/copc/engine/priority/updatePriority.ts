/**
 * Base-10 multi-criteria priority encoding.
 *
 * Digit layout (most significant first):
 * | Position | Criterion | Left shift |
 * |----------|-----------|------------|
 * | 1 | Foveated factor (center=0, edge=1) | ×10^4 |
 * | 0 | Preferred sort: reverse screen-space error (blurriest first) | ×10^0 |
 *
 * Depth is the fractional part (least significant digits).
 */

import { priorityNormalizeAndClamp } from "./normalization";
import type { PriorityBounds } from "./normalization";
import type { CachedNode } from "../../types";

/**
 * Per-node priority metadata stored via a WeakMap side-car — keeps traversal
 * bookkeeping off the public CachedNode type.
 */
export interface PriorityState {
    priority: number;
    distanceToCamera: number;
    foveatedFactor: number;
    depth: number;
    priorityReverseScreenSpaceError: number;
}

/** Get (or seed with defaults) the per-node priority state side-car entry. */
export function getState(
    node: CachedNode,
    priorityStateMap: WeakMap<CachedNode, PriorityState>,
): PriorityState {
    let state = priorityStateMap.get(node);
    if (!state) {
        state = {
            priority: 0,
            distanceToCamera: node.distanceToCamera ?? 0,
            foveatedFactor: 0,
            depth: 0,
            priorityReverseScreenSpaceError: 0,
        };
        priorityStateMap.set(node, state);
    }
    return state;
}

/**
 * Compute the base-10 multi-criteria priority for a tile from its own
 * collected metrics: foveated factor and reverse screen-space error are
 * normalized against this traversal's bounds, depth rides the fractional
 * digits.
 *
 * @param tile - The tile to compute priority for.
 * @param bounds - Min/max bounds collected this traversal for normalization.
 */
export function updatePriority(
    tile: CachedNode,
    bounds: PriorityBounds,
    priorityStateMap: WeakMap<CachedNode, PriorityState>,
): number {
    const { normFoveated, normReverseSSE, normDepth } = normalizePriorityCriteria(
        tile,
        bounds,
        priorityStateMap,
    );

    // Preferred sorting: reverse-SSE, the blurriest tile loads first.
    const preferredSortingDigits = isolateDigits(normReverseSSE, 4, 0);
    const foveatedDigits = isolateDigits(normFoveated, 4, 4);

    // Depth is the fractional part (least significant).
    return normDepth + preferredSortingDigits + foveatedDigits;
}

/**
 * Normalize the continuous priority criteria to [0, 1].
 */
function normalizePriorityCriteria(
    tile: CachedNode,
    bounds: PriorityBounds,
    priorityStateMap: WeakMap<CachedNode, PriorityState>,
): {
    normFoveated: number;
    normReverseSSE: number;
    normDepth: number;
} {
    const tileState = getState(tile, priorityStateMap);

    const normFoveated = priorityNormalizeAndClamp(
        tileState.foveatedFactor,
        bounds.minFoveatedFactor,
        bounds.maxFoveatedFactor,
    );
    const normReverseSSE = priorityNormalizeAndClamp(
        tileState.priorityReverseScreenSpaceError,
        bounds.minReverseSSE,
        bounds.maxReverseSSE,
    );

    const normDepth = priorityNormalizeAndClamp(
        tileState.depth,
        bounds.minDepth,
        bounds.maxDepth,
    );

    return { normFoveated, normReverseSSE, normDepth };
}

/**
 * Isolate a digit group for base-10 priority packing.
 * @param normalizedValue - Value in [0, 1) after EPSILON7 subtraction.
 * @param numberOfDigits - Number of base-10 digits for this group.
 * @param leftShift - Power-of-10 shift for this group's position.
 */
function isolateDigits(
    normalizedValue: number,
    numberOfDigits: number,
    leftShift: number,
): number {
    const scale = Math.pow(10, numberOfDigits);
    const scaled = normalizedValue * scale;
    const integer = Math.floor(scaled);
    return integer * Math.pow(10, leftShift);
}
