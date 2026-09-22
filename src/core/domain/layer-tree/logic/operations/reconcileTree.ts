import type { TreeNode } from "@core/contracts";
import type { OperationResult, TreeState } from "../../types";
import { idsToRemove } from "../structure/idsToRemove";
import { collectSubtreeIds } from "../traversal/collectSubtreeIds";

/**
 * Input for reconciling an existing tree subtree with incoming nodes
 * from an external data source.
 */
export interface ReconcileTreeInput {
    state: TreeState;
    /** The parent ID — {@code null} for root level, a group ID for subtree level. */
    parentId: string | null;
    /** Nodes received from the data adapter. */
    incomingNodes: readonly TreeNode[];
}

/**
 * Computes the structural diff between the existing tree state and
 * an incoming batch of nodes from an external source.
 *
 * Works identically for root ({@code parentId = null}) and subtree levels —
 * the only difference is whether to read existing IDs from {@code state.rootIds}
 * or {@code state.childrenOf(parentId)}.
 *
 * Returns the ids to delete; registering and ordering the incoming batch is
 * the store's job, driven by the batch itself.
 */
export function reconcileTree(input: ReconcileTreeInput): OperationResult {
    const existingIds =
        input.parentId === null
            ? input.state.rootIds
            : input.state.childrenOf(input.parentId);

    const staleRootIds = idsToRemove(existingIds, input.incomingNodes);

    const removed = staleRootIds.flatMap((id) =>
        collectSubtreeIds(id, (nid) => input.state.getNode(nid)),
    );

    return { removed };
}
