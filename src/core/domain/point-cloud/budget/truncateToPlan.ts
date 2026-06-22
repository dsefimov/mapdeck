import type { CachedNode } from "@core/framework/types";

/**
 * Truncate a toLoad list to fit within the remaining point budget.
 * Greedily accepts nodes in plan order until budget is exhausted.
 */
export function truncateToPlan(
    toLoad: string[],
    nodeCache: ReadonlyMap<string, CachedNode>,
    remainingBudget: number,
): string[] {
    const truncated: string[] = [];
    let budgetLeft = Math.max(0, remainingBudget);
    for (const key of toLoad) {
        const node = nodeCache.get(key);
        if (node && node.pointCount <= budgetLeft) {
            truncated.push(key);
            budgetLeft -= node.pointCount;
        }
    }
    return truncated;
}
