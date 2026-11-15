import type { TreeNode } from "@core/contracts";

/**
 * Returns IDs from `existingIds` that are NOT present in `incomingNodes`.
 * Used to detect stale tree nodes that need to be removed.
 *
 * @param existingIds - Iterable of existing node IDs (e.g. `this._nodes.keys()` or `node.childrenIds`)
 * @param incomingNodes - New array of tree nodes to compare against
 * @returns Array of IDs to remove (new array, no mutation)
 */
export function idsToRemove(
    existingIds: Iterable<string>,
    incomingNodes: readonly TreeNode[],
): string[] {
    const incomingIds = new Set(incomingNodes.map((n) => n.id));
    const result: string[] = [];
    for (const id of existingIds) {
        if (!incomingIds.has(id)) result.push(id);
    }
    return result;
}
