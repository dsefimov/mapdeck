/**
 * Atomic parent+siblings block reservation for the budget planner.
 * Pure function — deterministic, no side effects.
 */

import type { CachedNode } from "@core/framework/types";

/** Input context for reserveSiblingBlock. */
export interface BlockReservationInput {
    parentKey: string;
    parentNode: CachedNode | undefined;
    siblingKeys: Set<string>;
    runningPointCount: number;
    pointBudget: number;
    nodeCache: ReadonlyMap<string, CachedNode>;
    /** Set of already-accepted keys (mutated on success). */
    accepted: Set<string>;
}

/**
 * Try to reserve an atomic block (parent + all siblings) in a single step.
 *
 * @returns `{ keysToAccept, pointsConsumed }` if the entire block fits,
 *          `null` if it doesn't.
 */
export function reserveSiblingBlock(
    input: BlockReservationInput,
): { keysToAccept: string[]; pointsConsumed: number } | null {
    const {
        parentKey,
        parentNode,
        siblingKeys,
        runningPointCount,
        pointBudget,
        nodeCache,
        accepted,
    } = input;

    let blockPointCount =
        parentNode && !accepted.has(parentKey) ? parentNode.pointCount : 0;
    const keysToAccept: string[] = [];

    for (const siblingKey of siblingKeys) {
        const siblingNode = nodeCache.get(siblingKey);
        if (siblingNode) {
            blockPointCount += siblingNode.pointCount;
            keysToAccept.push(siblingKey);
        }
    }

    if (parentNode && !accepted.has(parentKey)) {
        keysToAccept.unshift(parentKey);
    }

    if (runningPointCount + blockPointCount <= pointBudget) {
        for (const k of keysToAccept) {
            accepted.add(k);
        }
        return { keysToAccept, pointsConsumed: blockPointCount };
    }

    return null;
}
