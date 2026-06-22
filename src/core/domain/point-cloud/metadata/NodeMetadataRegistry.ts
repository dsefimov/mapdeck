import type { CachedNode } from "@core/framework/types";
import type { PriorityState } from "../priority";
import type { AncestorLinks } from "../traversal/lodSeparation";

/** Per-node load metadata. */
export interface NodeLoadMeta {
    loadedAtFrame?: number;
    loadController?: AbortController;
}

function ensureLoadMeta(): NodeLoadMeta {
    return {};
}

function ensurePriorityState(): PriorityState {
    return {} as PriorityState;
}

function ensureAncestorLinks(): AncestorLinks {
    return {
        ancestorWithContent: undefined,
        ancestorWithContentAvailable: undefined,
        requestedFrame: undefined,
    };
}

/**
 * Consolidated container for per-node metadata stored via WeakMaps.
 * Groups load, priority, and ancestor metadata in one place
 * so lifecycle (creation, cleanup) is centralized.
 */
export class NodeMetadataRegistry {
    readonly load = new WeakMap<CachedNode, NodeLoadMeta>();
    readonly priority = new WeakMap<CachedNode, PriorityState>();
    readonly ancestors = new WeakMap<CachedNode, AncestorLinks>();

    loadMeta(node: CachedNode): NodeLoadMeta {
        let meta = this.load.get(node);
        if (!meta) {
            meta = ensureLoadMeta();
            this.load.set(node, meta);
        }
        return meta;
    }

    priorityState(node: CachedNode): PriorityState {
        let state = this.priority.get(node);
        if (!state) {
            state = ensurePriorityState();
            this.priority.set(node, state);
        }
        return state;
    }

    ancestorLinks(node: CachedNode): AncestorLinks {
        let links = this.ancestors.get(node);
        if (!links) {
            links = ensureAncestorLinks();
            this.ancestors.set(node, links);
        }
        return links;
    }

    /** Remove load and ancestor metadata for a node on eviction. */
    clear(node: CachedNode): void {
        this.load.delete(node);
        this.ancestors.delete(node);
        // Priority state persists across evictions (overwritten on next traversal).
    }
}
