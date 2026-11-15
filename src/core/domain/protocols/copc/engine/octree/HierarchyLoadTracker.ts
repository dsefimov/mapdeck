/**
 * Idempotent, lazy hierarchy loading for COPC octree.
 *
 * Each `ensureLoaded` call fetches exactly ONE hierarchy page — never its
 * descendants. A page's split pointers land in `pageByKey`, and the caller
 * decides which subtrees to expand next (`TraversalOrchestrator` caps that
 * pace per cycle), so the first points render after the root page instead
 * of after a full-tree walk.
 *
 * Two independent guard layers keep every page processed exactly once, even
 * under concurrent or overlapping requests:
 *
 * 1. **Top-level key** — concurrent `ensureLoaded(key)` calls share one in-flight
 *    Promise. Second caller awaits the same result instead of initiating a
 *    duplicate fetch.
 *
 * 2. **Per-node key** (`_registeredNodeKeys`) — even if two different top-level
 *    expansions load overlapping hierarchy pages (common in octrees where sibling
 *    leaf nodes share parent pages), each node key is inserted into the callback
 *    exactly once.
 */

import { Hierarchy } from "copc";
import type { Getter } from "copc";
import { logger } from "@core/lib/logger";

/** Callback invoked when new nodes are discovered. Receives only the fresh (not-yet-registered) nodes. */
export type OnNodesDiscovered = (subtree: Hierarchy.Subtree) => void;

/** `fatal: true` propagates a double-failed fetch — the root page must throw. */
export interface EnsureLoadedOptions {
    fatal?: boolean;
}

export class HierarchyLoadTracker {
    /** Top-level keys whose page has been loaded. */
    private _loadedKeys = new Set<string>();
    /** In-flight Promises by top-level key — concurrent calls share the same Promise. */
    private _inFlight = new Map<string, Promise<void>>();
    /** Individual node keys already delivered to `onNodesDiscovered`. */
    private _registeredNodeKeys = new Set<string>();

    /** Per-node hierarchy page — populated during _registerNodesOnce. */
    readonly pageByKey = new Map<string, Hierarchy.Page>();

    /**
     * @param source - Copc source (URL string or Getter).
     * @param onNodesDiscovered - Callback for newly discovered nodes (nodeCache + rbush mutations).
     */
    constructor(
        private readonly _source: string | Getter,
        private readonly _onNodesDiscovered: OnNodesDiscovered,
    ) {}

    /**
     * Load the hierarchy page for a top-level key — one page, no descent.
     * Idempotent: subsequent calls with the same key return the already
     * resolved (or in-flight) Promise. Without `fatal`, a page that fails
     * twice is skipped with a warning and still counts as loaded.
     */
    async ensureLoaded(
        key: string,
        page: Hierarchy.Page,
        opts: EnsureLoadedOptions = {},
    ): Promise<void> {
        if (this._loadedKeys.has(key)) return;

        const existing = this._inFlight.get(key);
        if (existing) {
            // Concurrent request for the same key — share the in-flight Promise.
            await existing;
            return;
        }

        const promise = this._loadPage(page, opts.fatal === true)
            .then((subtree) => {
                if (subtree) this._registerNodesOnce(subtree);
            })
            .finally(() => {
                this._inFlight.delete(key);
            });
        this._inFlight.set(key, promise);
        await promise;
        this._loadedKeys.add(key);
    }

    /**
     * Load hierarchy pages for multiple top-level keys — one page each,
     * independently idempotent. Returns the number of keys that were NOT
     * previously loaded (i.e., actually fetched this call): zero means no
     * progress is possible and the caller should stop re-running.
     */
    async ensureLoadedMany(
        keys: string[],
        rootPages: Map<string, Hierarchy.Page>,
    ): Promise<number> {
        const unloaded = keys.filter(
            (key) => !this._loadedKeys.has(key) && rootPages.has(key),
        );
        if (unloaded.length === 0) return 0;

        await Promise.all(
            unloaded.map((key) =>
                this.ensureLoaded(key, rootPages.get(key)!),
            ),
        );
        return unloaded.length;
    }

    /** Clear all state. */
    clear(): void {
        this._loadedKeys.clear();
        this._inFlight.clear();
        this._registeredNodeKeys.clear();
        this.pageByKey.clear();
    }

    /**
     * One page fetch with a single retry. A fatal page (the root) still
     * throws — nothing works without it — but a deep page that fails twice
     * is skipped with a warning: one dead branch must not cap the discovery
     * depth for the rest of the tree forever.
     */
    private async _loadPage(
        page: Hierarchy.Page,
        fatal: boolean,
    ): Promise<Hierarchy.Subtree | null> {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                return await Hierarchy.load(this._source, page);
            } catch (error) {
                if (fatal && attempt === 1) throw error;
                if (attempt === 1) {
                    logger.warn(
                        `Hierarchy page load failed twice, skipping branch: ` +
                            `${error instanceof Error ? error.message : String(error)}`,
                    );
                    return null;
                }
            }
        }
        return null;
    }

    /**
     * Filter a subtree to include only nodes that haven't been registered yet.
     * This is the second guard layer — prevents RBush duplicates even when
     * two different top-level expansions load overlapping hierarchy pages.
     */
    private _registerNodesOnce(subtree: Hierarchy.Subtree): void {
        const freshNodes: Hierarchy.Subtree["nodes"] = {};
        let hasFreshNodes = false;

        for (const [key, entry] of Object.entries(subtree.nodes)) {
            if (!entry || this._registeredNodeKeys.has(key)) continue;
            this._registeredNodeKeys.add(key);
            freshNodes[key] = entry;
            hasFreshNodes = true;
        }

        // Store per-node hierarchy pages for expansion queries.
        for (const [childKey, page] of Object.entries(subtree.pages)) {
            if (page) this.pageByKey.set(childKey, page);
        }

        if (hasFreshNodes) {
            this._onNodesDiscovered({
                nodes: freshNodes,
                pages: subtree.pages,
            });
        }
    }
}
