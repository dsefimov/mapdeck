import { type TreeNode, isGroupNode } from "@core/contracts";

/**
 * Depth-first collects all node IDs in the subtree rooted at `nodeId`,
 * including the root node itself. Leaf nodes are included as single-element arrays.
 *
 * @param nodeId - Root of the subtree to collect
 * @param getNode - Lookup function to resolve an ID to a TreeNode (or undefined if not found)
 * @returns Flat array of all node IDs in the subtree (parent-first depth-first order)
 */
export function collectSubtreeIds(
    nodeId: string,
    getNode: (id: string) => TreeNode | undefined,
): string[] {
    const node = getNode(nodeId);
    if (!node) return [nodeId];
    if (!isGroupNode(node)) return [nodeId];

    const childIds = node.childrenIds.flatMap((id) => collectSubtreeIds(id, getNode));
    return [nodeId, ...childIds];
}
