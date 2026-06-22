/**
 * Base-10 multi-criteria priority encoding.
 *
 * Digit layout (most significant first):
 * | Position | Criterion | Left shift |
 * |----------|-----------|------------|
 * | 4 | Progressive resolution leaf (0 = leaf, 1 = non-leaf) | ×10^8 |
 * | 1 | Foveated factor (center=0, edge=1) | ×10^4 |
 * | 0 | Preferred sort: distanceToCamera or reverseScreenSpaceError | ×10^0 |
 *
 * Depth is the fractional part (least significant digits).
 */

import { priorityNormalizeAndClamp } from "./normalization";
import type { PriorityBounds } from "./normalization";
import type { CachedNode } from "@core/framework/types";

/**
 * Per-node priority metadata stored via WeakMap side-car.
 * Replaces _priorityHolder, _distanceToCamera, _foveatedFactor, _depth,
 * _priorityReverseScreenSpaceError, _priority on the public CachedNode type.
 */
export interface PriorityState {
    priority: number;
    priorityHolder: CachedNode;
    distanceToCamera: number;
    foveatedFactor: number;
    depth: number;
    priorityReverseScreenSpaceError: number;
}

function getState(
    node: CachedNode,
    priorityStateMap: WeakMap<CachedNode, PriorityState>,
): PriorityState {
    let state = priorityStateMap.get(node);
    if (!state) {
        // Use the node's own values as defaults.
        state = {
            priority: 0,
            priorityHolder: node,
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
 * Priority computation options — grouped configuration for the priority strategy.
 */
export interface PriorityOptions {
    preferLeaves?: boolean;
    priorityProgressiveResolution?: boolean;
    isSkippingLevelOfDetail?: boolean;
}

/**
 * Compute the base-10 multi-criteria priority for a tile.
 *
 * Uses tile's PriorityState.priorityHolder's distance and foveatedFactor,
 * NOT tile's own values — this ensures siblings within a refinable subtree
 * are compared by depth rather than distance.
 *
 * @param tile - The tile to compute priority for.
 * @param bounds - Min/max bounds collected this traversal for normalization.
 * @param options - Priority strategy configuration.
 */
export function updatePriority(
    tile: CachedNode,
    bounds: PriorityBounds,
    priorityStateMap: WeakMap<CachedNode, PriorityState>,
    options?: PriorityOptions,
): number {
    const { normDist, normFoveated, normReverseSSE, normDepth } =
        normalizePriorityCriteria(tile, bounds, priorityStateMap, options);

    // Preferred sorting: distance (base traversal, REPLACE refinement) or reverse-SSE.
    // In skip traversal, always use distance.
    const useDistance = options?.isSkippingLevelOfDetail ?? false;
    const prefValue = useDistance ? normDist : normReverseSSE;

    // Encode each digit group.
    const preferredSortingDigits = isolateDigits(prefValue, 4, 0);
    const foveatedDigits = isolateDigits(normFoveated, 4, 4);

    // Progressive resolution: leaf gets 0 (no penalty), non-leaf gets 10^8.
    const progressiveResolutionScale = Math.pow(10, 8);
    const progressiveResolutionDigits = options?.priorityProgressiveResolution
        ? 0
        : progressiveResolutionScale;

    // Depth is the fractional part (least significant).
    return (
        normDepth +
        preferredSortingDigits +
        progressiveResolutionDigits +
        foveatedDigits
    );
}

/**
 * Normalize all four continuous priority criteria to [0, 1].
 */
function normalizePriorityCriteria(
    tile: CachedNode,
    bounds: PriorityBounds,
    priorityStateMap: WeakMap<CachedNode, PriorityState>,
    options?: PriorityOptions,
): {
    normDist: number;
    normFoveated: number;
    normReverseSSE: number;
    normDepth: number;
} {
    const tileState = getState(tile, priorityStateMap);
    const holder = tileState.priorityHolder;
    const holderState =
        holder !== tile ? getState(holder, priorityStateMap) : tileState;
    const holderDistance = holderState.distanceToCamera;
    const holderFoveated = holderState.foveatedFactor;
    const depth = tileState.depth;
    const reverseSSE = tileState.priorityReverseScreenSpaceError;

    const normDist = priorityNormalizeAndClamp(
        holderDistance,
        bounds.minDistance,
        bounds.maxDistance,
    );
    const normFoveated = priorityNormalizeAndClamp(
        holderFoveated,
        bounds.minFoveatedFactor,
        bounds.maxFoveatedFactor,
    );
    const normReverseSSE = priorityNormalizeAndClamp(
        reverseSSE,
        bounds.minReverseSSE,
        bounds.maxReverseSSE,
    );

    let normDepth = priorityNormalizeAndClamp(
        depth,
        bounds.minDepth,
        bounds.maxDepth,
    );

    if (options?.preferLeaves) {
        normDepth = 1.0 - normDepth;
    }

    return { normDist, normFoveated, normReverseSSE, normDepth };
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
