import { isLayerNode, type LayerNode, type TreeNode } from "@core/contracts";

/**
 * Carries the user-modifiable state of a surviving tree node over to its
 * incoming replacement: `isVisible` and, for layer nodes, the whole `style`
 * object (which holds any user overrides applied by layer tools).
 *
 * Structural and data fields come from the incoming node. When the old node
 * has no style, the incoming node's style wins. Returns a fresh object and
 * mutates neither input.
 */
export function mergeUserState(
    oldNode: TreeNode,
    incomingNode: TreeNode,
): TreeNode {
    if (isLayerNode(oldNode) && isLayerNode(incomingNode) && oldNode.style) {
        const merged: LayerNode = {
            ...incomingNode,
            isVisible: oldNode.isVisible,
        };
        merged.style = oldNode.style;
        return merged;
    }
    return { ...incomingNode, isVisible: oldNode.isVisible };
}
