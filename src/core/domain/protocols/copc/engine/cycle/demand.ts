import type { CachedNode, CandidateNode } from "../../types";

/**
 * Points the current view still wants: candidates not yet loaded (pending,
 * or waiting out an error retry). This is the budget reservation eviction
 * honors before letting invisible tiles keep memory.
 */
export function sumPendingDemandPoints(
    candidates: CandidateNode[],
    nodeCache: ReadonlyMap<string, CachedNode>,
): number {
    let demand = 0;
    for (const candidate of candidates) {
        const node = nodeCache.get(candidate.key);
        if (node?.state === "pending" || node?.state === "error") {
            demand += node.pointCount;
        }
    }
    return demand;
}
