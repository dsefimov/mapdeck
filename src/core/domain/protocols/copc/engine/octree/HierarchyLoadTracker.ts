/**
 * Idempotent hierarchy loading for COPC octree.
 *
 * Guarantees that each hierarchy page is processed exactly once, even under
 * concurrent or overlapping requests. Uses two independent guard layers:
 *
 * 1. **Top-level key** — concurrent `ensureLoaded(key)` calls share one in-flight
 *    Promise. Second caller awaits the same result instead of initiating a
 *    duplicate traversal.
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

export class HierarchyLoadTracker {
    /** Top-level keys whose hierarchy has been fully loaded. */
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
     * Load the hierarchy for a top-level key. Idempotent: subsequent calls
     * with the same key return the already-resolved (or in-flight) Promise.
     */
    async ensureLoaded(key: string, rootPage: Hierarchy.Page): Promise<void> {
        if (this._loadedKeys.has(key)) return;

        const existing = this._inFlight.get(key);
        if (existing) {
            // Concurrent request for the same key — share the in-flight Promise.
            await existing;
            return;
        }

        const promise = this._loadRecursive(rootPage, true).finally(() => {
            this._inFlight.delete(key);
        });
        this._inFlight.set(key, promise);
        await promise;
        this._loadedKeys.add(key);
    }

    /**
     * Load hierarchy for multiple top-level keys. Each key is independently
     * idempotent. Returns the number of keys that were NOT previously loaded
     * (i.e., actually fetched this call).
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
            unloaded.map((key) => this.ensureLoaded(key, rootPages.get(key)!)),
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

    private async _loadRecursive(
        page: Hierarchy.Page,
        isRoot: boolean,
    ): Promise<void> {
        const subtree = await this._loadPage(page, isRoot);
        if (!subtree) return;
        this._registerNodesOnce(subtree);

        const childPages = Object.values(subtree.pages).filter(
            Boolean,
        ) as Hierarchy.Page[];
        await this._loadChildren(childPages);
    }

    /**
     * One page fetch with a single retry. The root page still throws —
     * nothing works without it — but a deep page that fails twice is
     * skipped with a warning: one dead branch must not cap the discovery
     * depth for the rest of the tree forever.
     */
    private async _loadPage(
        page: Hierarchy.Page,
        isRoot: boolean,
    ): Promise<Hierarchy.Subtree | null> {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                return await Hierarchy.load(this._source, page);
            } catch (error) {
                if (isRoot && attempt === 1) throw error;
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

    /** Breadth-capped recursion — one page can fan out into dozens. */
    private async _loadChildren(pages: Hierarchy.Page[]): Promise<void> {
        const WIDTH = 8;
        for (let i = 0; i < pages.length; i += WIDTH) {
            await Promise.all(
                pages
                    .slice(i, i + WIDTH)
                    .map((p) => this._loadRecursive(p, false)),
            );
        }
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
