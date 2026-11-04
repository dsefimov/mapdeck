/**
 * Budget-driven eviction over the loaded set.
 *
 * The victim order encodes the allocation policy: the budget serves the
 * view in front of the user first. Nodes the current cycle selected are
 * untouchable; everything else is ranked by distance from the viewport
 * rectangle — farthest first, stalest traversal stamp breaking ties — so
 * the most distant, longest-unseen tiles shed before anything the camera
 * might swing back to. A loaded parent whose region is still loading
 * stays: it is the only fallback renderer for its children. Evicted nodes
 * leave through the onEvict hook (the decoded-node LRU salvages them),
 * which is what makes an early eviction cheap to undo.
 */

import type { CachedNode } from "../../types";
import { getOctreeChildKeys } from "../octree/octreeKey";
import { clearTileData } from "./clearTileData";
import {
    distanceToViewportMeters,
    type ViewportRect,
} from "./distanceToViewport";

/** Result of evictToBudget. */
export interface EvictionResult {
    freedPoints: number;
    evictedCount: number;
}

/** Context passed to evictToBudget. */
export interface EvictionContext {
    totalPoints: number;
    /**
     * Evict until the resident set fits: max(0, pointBudget − the demand
     * the current view still has). Zero means the view wants everything.
     */
    targetPoints: number;
    currentFrame: number;
    viewportBounds: ViewportRect;
    nodeCache: ReadonlyMap<string, CachedNode>;
    errorKeys: Set<string>;
}

export class TileEvictionManager {
    /**
     * @param onEvict - Invoked with a tile right before its data is
     * cleared — the hook a decoded-node cache uses to salvage the buffers.
     */
    constructor(private readonly _onEvict?: (tile: CachedNode) => void) {}

    /**
     * Single pass over the loaded set: rank the evictable tiles and evict
     * from the worst end until the target holds. The loaded set is a few
     * hundred nodes at most, so a scan-and-sort beats maintaining a
     * replacement queue.
     */
    evictToBudget(ctx: EvictionContext): EvictionResult {
        if (ctx.totalPoints <= ctx.targetPoints) {
            return { freedPoints: 0, evictedCount: 0 };
        }

        const victims: { tile: CachedNode; distance: number }[] = [];
        for (const tile of ctx.nodeCache.values()) {
            if (tile.state !== "loaded") continue;
            // This cycle's candidates carry the current frame stamp.
            if (tile.lastSeenAt === ctx.currentFrame) continue;
            if (this._hasUnfinishedChildren(tile, ctx)) continue;
            victims.push({
                tile,
                distance: distanceToViewportMeters(
                    tile.boundsWgs84,
                    ctx.viewportBounds,
                ),
            });
        }
        victims.sort((a, b) => {
            const byDistance = b.distance - a.distance;
            if (byDistance !== 0) return byDistance;
            const byAge =
                (a.tile.lastSeenAt ?? -1) - (b.tile.lastSeenAt ?? -1);
            if (byAge !== 0) return byAge;
            return a.tile.key < b.tile.key ? -1 : 1;
        });

        let freed = 0;
        let count = 0;
        for (const { tile } of victims) {
            if (ctx.totalPoints - freed <= ctx.targetPoints) break;
            this._onEvict?.(tile);
            freed += clearTileData(tile, ctx.errorKeys);
            count++;
        }

        return { freedPoints: freed, evictedCount: count };
    }

    /**
     * A loaded parent is the only fallback renderer for the regions of its
     * children that have not arrived yet; evicting it mid-refinement punches
     * visible holes. In-flight children pin it outright; a pending or
     * errored child pins it only while this cycle still considers it a
     * candidate (fresh frame stamp), so abandoned subtrees — including ones
     * with permanently broken children — cannot pin memory forever.
     */
    private _hasUnfinishedChildren(
        tile: CachedNode,
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
                    return child.lastSeenAt === ctx.currentFrame;
                default:
                    return false;
            }
        });
    }
}
