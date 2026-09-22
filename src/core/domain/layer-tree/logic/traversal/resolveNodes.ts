import type { TreeNode } from "@core/contracts";
import type { TreeState } from "../../types";

/**
 * Resolves an array of node IDs to their TreeNode objects.
 * IDs not found in the tree are silently omitted.
 */
export function resolveNodes(
    state: TreeState,
    ids: readonly string[],
): TreeNode[] {
    const result: TreeNode[] = [];
    for (const id of ids) {
        const node = state.getNode(id);
        if (node) result.push(node);
    }
    return result;
}
