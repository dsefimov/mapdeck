/**
 * Count occupied budget: sum pointCount of loaded and loading nodes.
 * Pure function — deterministic, no side effects.
 */

import type { CachedNode } from "@core/framework/types";

export interface OccupiedBudgetResult {
    /** Total point count of loaded + loading nodes. */
    occupied: number;
    /** Keys of nodes already occupying budget slots. */
    acceptedKeys: Set<string>;
}

/**
 * Scan nodeCache for loaded/loading nodes and compute occupied budget.
 *
 * Both "loaded" and "loading" nodes reserve their budget slot, so both are
 * counted here to prevent over-commit.
 */
export function computeOccupiedBudget(
    nodeCache: ReadonlyMap<string, CachedNode>,
): OccupiedBudgetResult {
    let occupied = 0;
    const acceptedKeys = new Set<string>();

    for (const [, node] of nodeCache) {
        if (node.state === "loaded" || node.state === "loading") {
            occupied += node.pointCount;
            acceptedKeys.add(node.key);
        }
    }

    return { occupied, acceptedKeys };
}
