import { type TreeNode, isGroupNode } from "@core/contracts";
import type { TreeState } from "../../types";

/** Result of a traversal: the ids of matched nodes. */
export interface TraverseResult {
    matchedIds: Set<string>;
}

/** Options of an async tree traversal. */
export interface TraverseOptions {
    predicate: (node: TreeNode) => boolean;
    signal?: AbortSignal | undefined;
    loadUnloaded?: boolean | undefined;
}

type RefreshCallback = (id: string, signal?: AbortSignal) => Promise<void>;

interface TraverseContext {
    state: TreeState;
    refresh: RefreshCallback;
    options: TraverseOptions;
    matchedIds: Set<string>;
}

/**
 * Asynchronously traverses the tree starting from the given node IDs.
 * Recursively visits nodes, optionally loading unloaded children,
 * applies a predicate filter, and collects matched IDs.
 *
 * @param state - The tree navigation interface
 * @param startIds - Root node IDs to start traversal from
 * @param refresh - Callback to load unloaded children for a node
 * @param options - Traversal options (predicate, signal, loadUnloaded)
 * @returns A TraverseResult with matchedIds
 */
export async function traverseTreeAsync(
    state: TreeState,
    startIds: string[],
    refresh: RefreshCallback,
    options: TraverseOptions,
): Promise<TraverseResult> {
    const ctx: TraverseContext = {
        state,
        refresh,
        options,
        matchedIds: new Set<string>(),
    };

    for (const id of startIds) {
        await traverseNode(ctx, id);
        if (options.signal?.aborted) break;
    }

    return { matchedIds: ctx.matchedIds };
}

async function traverseNode(
    ctx: TraverseContext,
    nodeId: string,
): Promise<void> {
    if (ctx.options.signal?.aborted) return;

    const node = ctx.state.getNode(nodeId);
    if (!node) return;

    if (ctx.options.predicate(node)) {
        ctx.matchedIds.add(nodeId);
    }

    if (isGroupNode(node)) {
        await traverseGroupChildren(ctx, nodeId);
    }
}

async function traverseGroupChildren(
    ctx: TraverseContext,
    nodeId: string,
): Promise<void> {
    const { signal, loadUnloaded } = ctx.options;

    if (loadUnloaded) {
        // The "children not loaded" decision lives in the refresh callback
        // (LayerTreeStore.ensureChildrenLoaded).
        await ctx.refresh(nodeId, signal);
        if (signal?.aborted) return;
    }

    const refreshedIds = ctx.state.childrenOf(nodeId);

    for (const childId of refreshedIds) {
        await traverseNode(ctx, childId);
        if (signal?.aborted) return;
    }
}
