import type { TreeNode } from "@core/framework/types";
import { isGroupNode } from "@core/framework/types";
import type { Bbox } from "@core/shared/geo";

export function resolveNodeExtent(
    node: TreeNode,
    getCombinedExtent: (nodeId: string) => Bbox | null,
): Bbox | null {
    if (isGroupNode(node)) {
        return getCombinedExtent(node.id) ?? node.bbox;
    }
    return node.bbox;
}
