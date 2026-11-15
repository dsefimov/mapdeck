import type { TreeNode } from "@core/contracts";

/**
 * Navigation interface for tree domain operations.
 * Decouples domain functions from MobX observable internals —
 * the store implements this by wrapping {@code observable.map} and {@code observable.array}.
 */
export interface TreeState {
    /** Lookup a node by ID. Returns undefined if not found. */
    getNode(id: string): TreeNode | undefined;

    /** Child IDs of a group node. Returns empty array for missing or non-group nodes. */
    childrenOf(parentId: string): readonly string[];

    /** Top-level node IDs in display order. */
    readonly rootIds: readonly string[];
}
/**
 * Result of a tree domain operation.
 * Carries only the deletions; registration and ordering come from the
 * incoming node batch the store applies alongside this result through the
 * single {@code applyResult} method.
 */
export interface OperationResult {
    /** IDs of nodes to delete — already includes all descendants. */
    removed: string[];
}
