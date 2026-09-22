import type { TreeState } from "../../types";
import { traverseTreeAsync } from "../traversal/traverseTreeAsync";

/** Options of {@link cascadeVisibility}. */
export interface CascadeVisibilityOptions {
    /** Lazy-load callback for unloaded groups (e.g. `LayerTreeStore.ensureChildrenLoaded`). */
    loadChildren?: (nodeId: string, signal?: AbortSignal) => Promise<void>;
    signal?: AbortSignal;
}

/**
 * Computes the node ids of the subtree rooted at `startIds` whose `isVisible`
 * SHALL be set to `visible`: the start nodes and all reachable descendants.
 *
 * Showing loads unloaded groups through `loadChildren` first; hiding traverses
 * only already-loaded descendants and performs no loading. Reuses the same
 * traversal machinery as search.
 *
 * Does not mutate nodes — the caller applies `isVisible` to its observable
 * state from the returned ids.
 */
export function cascadeVisibility(
    state: TreeState,
    startIds: string[],
    visible: boolean,
    options: CascadeVisibilityOptions = {},
): Promise<Set<string>> {
    return traverseTreeAsync(
        state,
        startIds,
        options.loadChildren ?? (() => Promise.resolve()),
        {
            predicate: () => true,
            loadUnloaded: visible,
            signal: options.signal,
        },
    ).then((result) => result.matchedIds);
}
