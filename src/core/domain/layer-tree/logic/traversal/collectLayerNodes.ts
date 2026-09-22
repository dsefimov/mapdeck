import {
    type LayerNode,
    isGroupNode,
    isLayerNode,
} from "@core/contracts";
import type { TreeState } from "../../types";

/**
 * Depth-first collects all layer (leaf) nodes reachable from the tree roots,
 * using {@link TreeState} for navigation (decoupled from MobX internals).
 */
export function collectLayerNodes(state: TreeState): LayerNode[] {
    const result: LayerNode[] = [];
    const stack = [...state.rootIds];

    while (stack.length > 0) {
        const id = stack.pop()!;
        const node = state.getNode(id);
        if (!node) continue;

        if (isLayerNode(node)) result.push(node);

        if (isGroupNode(node)) {
            const childIds = state.childrenOf(id);
            for (let i = childIds.length - 1; i >= 0; i--) {
                const childId = childIds[i];
                if (childId !== undefined) stack.push(childId);
            }
        }
    }

    return result;
}
