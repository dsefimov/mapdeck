import { type TreeNode, isGroupNode, isLayerNode } from "@core/contracts";
import type { AttributeLayerInfo } from "./index";

/**
 * Selectable layers for the attribute table: layer nodes that carry data,
 * each labeled with its group's title when the parent is a group.
 */
export function buildAttributeLayers(
    layerNodes: readonly TreeNode[],
    getNode: (id: string) => TreeNode | undefined,
): AttributeLayerInfo[] {
    const result: AttributeLayerInfo[] = [];
    for (const node of layerNodes) {
        if (!isLayerNode(node) || !node.data) continue;
        let groupTitle: string | null = null;
        if (node.parentId) {
            const parent = getNode(node.parentId);
            if (parent && isGroupNode(parent)) {
                groupTitle = parent.title;
            }
        }
        result.push({ id: node.id, title: node.title, groupTitle });
    }
    return result;
}
