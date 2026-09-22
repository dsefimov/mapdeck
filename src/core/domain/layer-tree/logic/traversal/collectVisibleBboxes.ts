import { type Bbox } from "@core/lib/geo";
import { isGroupNode, isLayerNode } from "@core/contracts";
import type { TreeState } from "../../types";

/**
 * Recursively collects bounding boxes of all visible layer nodes
 * reachable from {@code nodeId}. Non-visible nodes and nodes without
 * a bbox are silently skipped.
 */
export function collectVisibleBboxes(state: TreeState, nodeId: string): Bbox[] {
    const node = state.getNode(nodeId);
    if (!node) return [];

    if (isLayerNode(node) && node.isVisible && node.bbox) {
        return [node.bbox];
    }

    if (isGroupNode(node)) {
        return state
            .childrenOf(nodeId)
            .flatMap((id) => collectVisibleBboxes(state, id));
    }

    return [];
}
