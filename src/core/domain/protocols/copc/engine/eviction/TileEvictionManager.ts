/**
 * Unified Cesium-style tile eviction manager.
 *
 * TileReplacementQueue (count-trim). Eviction is point-budget-driven
 * with render-frame boundary protection.
 *
 * - touch(tile):      Move tile to head (traversal visit or load).
 * - markStartOfRenderFrame(): Record current head as frame boundary.
 * - markTileRendered(tile):  Move tile to head (appeared in render).
 * - evictToBudget(ctx):      Single-pass eviction from tail until
 *                            totalPoints ≤ targetBudget.
 */

import type { CachedNode } from "../../types";
import { getOctreeChildKeys } from "../octree/octreeKey";
import { clearTileData } from "./clearTileData";

/** Internal node in the doubly-linked eviction list. */
interface EvictionNode<T> {
    item: T;
    prev: EvictionNode<T> | null;
    next: EvictionNode<T> | null;
}

/** Result of evictToBudget. */
export interface EvictionResult {
    freedPoints: number;
    evictedCount: number;
}

/** Context passed to evictToBudget. */
export interface EvictionContext {
    totalPoints: number;
    targetBudget: number;
    currentFrame: number;
    nodeCache: ReadonlyMap<string, CachedNode>;
    errorKeys: Set<string>;
}

export class TileEvictionManager<T extends CachedNode> {
    private _head: EvictionNode<T> | null = null;
    private _tail: EvictionNode<T> | null = null;
    private _frameBoundary: EvictionNode<T> | null = null;
    private readonly _nodeMap = new Map<T, EvictionNode<T>>();

    /** Move tile to head (or insert if not present). */
    touch(tile: T): void {
        const existing = this._nodeMap.get(tile);
        if (existing) {
            if (existing === this._head) return;
            this._unlink(existing);
            this._prependNode(existing);
        } else {
            const node: EvictionNode<T> = {
                item: tile,
                prev: null,
                next: null,
            };
            this._prependNode(node);
            this._nodeMap.set(tile, node);
        }
    }

    /** Record current head as the frame boundary. */
    markStartOfRenderFrame(): void {
        this._frameBoundary = this._head;
    }

    /** Move tile to head (equivalent to touch for render usage). */
    markTileRendered(tile: T): void {
        this.touch(tile);
    }

    /**
     * Single-pass eviction from tail toward head.
     * Returns total points freed.
     *
     * Protection rules (skip tile if any apply):
     * 1. Past frame boundary (rendered in current frame).
     * 2. lastSeenAt >= currentFrame - 1 (2-frame hysteresis).
     * 3. Any discovered child has not finished loading: a loading child
     *    pins its parent unconditionally; a pending or errored child pins
     *    it only while still traversal-relevant (seen within the
     *    hysteresis window), so abandoned subtrees — including ones with
     *    permanently broken children — cannot pin memory forever.
     */
evictToBudget(ctx: EvictionContext): EvictionResult {
        let freed = 0;
        let count = 0;
        let node = this._tail;

        while (node && ctx.totalPoints - freed > ctx.targetBudget) {
            // Protection 1: frame boundary — stop, don't evict current-frame tiles.
            if (node === this._frameBoundary) break;

            const tile = node.item;
            const prev = node.prev;

            if (this._isProtected(tile, ctx)) {
                node = prev;
                continue;
            }

            freed += clearTileData(tile, ctx.errorKeys);
            count++;
            this._removeNode(node);
            node = prev;
        }

        return { freedPoints: freed, evictedCount: count };
    }

    /** Check if a tile is protected from eviction. */
    private _isProtected(tile: T, ctx: EvictionContext): boolean {
        if (tile.state !== "loaded") return true;

        // 2-frame hysteresis.
        if (
            tile.lastSeenAt !== undefined &&
            tile.lastSeenAt >= ctx.currentFrame - 1
        ) {
            return true;
        }

        return this._hasUnfinishedChildren(tile, ctx);
    }

    /**
     * A loaded parent is the only fallback renderer for the regions of its
     * children that have not arrived yet; evicting it mid-refinement punches
     * visible holes. In-flight children pin it outright; a pending or
     * errored child pins it while still relevant to the traversal (fresh
     * lastSeenAt — a candidate this cycle, so a visible region keeps its
     * fallback). Stale children belong to abandoned subtrees and must let
     * memory go — an errored child otherwise pins its parent forever.
     */
    private _hasUnfinishedChildren(
        tile: T,
        ctx: EvictionContext,
    ): boolean {
        const childKeys = getOctreeChildKeys(tile.key);
        return childKeys.some((ck) => {
            const child = ctx.nodeCache.get(ck);
            if (!child) return false;
            switch (child.state) {
                case "loading":
                    return true;
                case "error":
                case "pending":
                    return (
                        child.lastSeenAt !== undefined &&
                        child.lastSeenAt >= ctx.currentFrame - 1
                    );
                default:
                    return false;
            }
        });
    }

    /** Remove a node from the list and the index map. */
    private _removeNode(node: EvictionNode<T>): void {
        this._nodeMap.delete(node.item);
        this._unlink(node);
    }

    /** Unlink a node from the doubly-linked list. */
    private _unlink(node: EvictionNode<T>): void {
        if (node === this._frameBoundary) {
            this._frameBoundary = node.prev;
        }
        if (node.prev) node.prev.next = node.next;
        else this._head = node.next;
        if (node.next) node.next.prev = node.prev;
        else this._tail = node.prev;
        node.prev = null;
        node.next = null;
    }

    /** Insert a node at the head of the list. */
    private _prependNode(node: EvictionNode<T>): void {
        node.prev = null;
        node.next = this._head;
        if (this._head) this._head.prev = node;
        else this._tail = node;
        this._head = node;
    }
}
