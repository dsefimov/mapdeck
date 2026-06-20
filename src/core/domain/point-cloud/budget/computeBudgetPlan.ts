/**
 * Budget planning for point-cloud streaming.
 * Pure function — deterministic, no side effects.
 *
 * Single source of truth for "how many points are occupied":
 * `occupied = sum of pointCount for all nodes with state === "loaded" || "loading"`.
 */

import type { CachedNode, BudgetPlan } from "@core/framework/types";
import type { CandidateNode } from "@core/framework/types";

/**
 * Greedy budget fill: sort candidates by priority DESC, accept until budget
 * exhausted. Handles parent-fallback block reservation.
 *
 * Counts BOTH `loaded` and `loading` nodes as occupied — this is the single
 * definition of "occupied" throughout the system. Previously `applyBudget`
 * counted only `loaded`, causing the budget to silently over-commit when
 * nodes were still loading.
 *
 * @param candidates - Candidates from current traversal, WITH priority already computed.
 * @param nodeCache - All cached nodes (for pointCount and state lookups).
 * @param pointBudget - Maximum total points to keep in memory.
 * @param fallbacks - childKey → parentKey mapping from traversal.
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export function computeBudgetPlan(
    candidates: CandidateNode[],
    nodeCache: ReadonlyMap<string, CachedNode>,
    pointBudget: number,
    fallbacks: ReadonlyMap<string, string>,
): BudgetPlan {
    const sorted = [...candidates].sort((a, b) => b.priority - a.priority);

    const accepted = new Set<string>();

    // Loading nodes reserve their budget slot before the fetch starts, so they
    // must be counted here to prevent over-commit.
    let runningPointCount = 0;
    for (const [, node] of nodeCache) {
        if (node.state === "loaded" || node.state === "loading") {
            runningPointCount += node.pointCount;
            accepted.add(node.key);
        }
    }

    const parentToChildren = new Map<string, Set<string>>();
    for (const [childKey, parentKey] of fallbacks) {
        let children = parentToChildren.get(parentKey);
        if (!children) {
            children = new Set();
            parentToChildren.set(parentKey, children);
        }
        children.add(childKey);
    }

    const processedBlocks = new Set<string>();

    for (const candidate of sorted) {
        const node = nodeCache.get(candidate.key);
        if (!node) continue;

        const parentKey = fallbacks.get(candidate.key);

        if (parentKey && !processedBlocks.has(parentKey)) {
            /* eslint-disable max-depth */
            // Reserve budget for the entire block atomically.
            const parentNode = nodeCache.get(parentKey);
            const siblingKeys = parentToChildren.get(parentKey) ?? new Set();

            let blockPointCount =
                parentNode && !accepted.has(parentKey)
                    ? parentNode.pointCount
                    : 0;
            const blockCandidates: CandidateNode[] = [];

            for (const siblingKey of siblingKeys) {
                const siblingNode = nodeCache.get(siblingKey);
                if (siblingNode) {
                    blockPointCount += siblingNode.pointCount;
                    const siblingCandidate = sorted.find(
                        (c) => c.key === siblingKey,
                    );
                    if (siblingCandidate) {
                        blockCandidates.push(siblingCandidate);
                    }
                }
            }

            if (!siblingKeys.has(candidate.key)) {
                blockPointCount += node.pointCount;
                blockCandidates.push(candidate);
            }

            if (runningPointCount + blockPointCount <= pointBudget) {
                // Accept the block atomically
                if (parentNode) accepted.add(parentKey);
                for (const bc of blockCandidates) {
                    accepted.add(bc.key);
                }
                runningPointCount += blockPointCount;
                processedBlocks.add(parentKey);
            } else {
                // Block doesn't fit: keep parent as fallback, accept children
                // greedily (by priority) within remaining budget.
                if (parentNode && !accepted.has(parentKey)) {
                    const parentFits =
                        runningPointCount + parentNode.pointCount <=
                        pointBudget;
                    if (parentFits) {
                        accepted.add(parentKey);
                        runningPointCount += parentNode.pointCount;
                    }
                }
                // Try to fit individual children within remaining budget
                // eslint-disable-next-line sonarjs/no-misleading-array-reverse
                const sortedSiblings = blockCandidates.sort(
                    (a, b) => b.priority - a.priority,
                );
                for (const bc of sortedSiblings) {
                    const bcNode = nodeCache.get(bc.key);
                    if (!bcNode) continue;
                    if (runningPointCount + bcNode.pointCount <= pointBudget) {
                        accepted.add(bc.key);
                        runningPointCount += bcNode.pointCount;
                    }
                }
                processedBlocks.add(parentKey);
            }
            /* eslint-enable max-depth */
            continue;
        }

        if (parentKey && processedBlocks.has(parentKey)) {
            continue;
        }

        if (runningPointCount + node.pointCount <= pointBudget) {
            accepted.add(candidate.key);
            runningPointCount += node.pointCount;
        }
    }

    const toLoad: string[] = [];
    for (const key of accepted) {
        const node = nodeCache.get(key);
        if (!node || node.state === "loaded" || node.state === "loading") {
            continue;
        }
        // Skip nodes that are on retry cooldown (caller filters these if needed)
        toLoad.push(key);
    }

    const toLoadPoints = toLoad.reduce((sum, key) => {
        const n = nodeCache.get(key);
        return sum + (n?.pointCount ?? 0);
    }, 0);
    const deficit = Math.max(0, runningPointCount + toLoadPoints - pointBudget);

    return {
        accepted: [...accepted],
        toLoad,
        deficit,
    };
}
