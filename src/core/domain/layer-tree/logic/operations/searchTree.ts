import type { TreeState } from "../../types";
import { traverseTreeAsync } from "../traversal/traverseTreeAsync";
import { matchesQuery } from "../predicates/matchesQuery";

/** Options of {@link searchTree}. */
export interface SearchTreeOptions {
    /** Lazy-load callback for unloaded groups (e.g. `LayerTreeStore.ensureChildrenLoaded`). */
    loadChildren: (nodeId: string, signal?: AbortSignal) => Promise<void>;
    signal?: AbortSignal;
}

/**
 * Searches the layer tree and returns the set of matched node ids.
 *
 * Composes the tree traversal with the match predicate, lazy-loading unloaded
 * groups through `options.loadChildren` before continuing (search covers the
 * whole subtree). The query is normalized (trim + lowercase) before matching;
 * an empty/whitespace query returns an empty set without traversing.
 *
 * Does not mutate the tree state and writes no search state anywhere — the
 * caller owns the returned set. Ancestor paths and row shaping are display
 * concerns of the caller.
 */
export function searchTree(
    state: TreeState,
    rootIds: string[],
    query: string,
    options: SearchTreeOptions,
): Promise<Set<string>> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return Promise.resolve(new Set<string>());

    return traverseTreeAsync(state, rootIds, options.loadChildren, {
        predicate: matchesQuery(normalized),
        loadUnloaded: true,
        signal: options.signal,
    }).then((result) => result.matchedIds);
}
