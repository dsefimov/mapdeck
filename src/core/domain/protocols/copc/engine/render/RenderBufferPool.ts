import { ColorScheme } from "@core/contracts";
import type { PointCloudData, PointCloudFrame } from "@core/contracts";
import type { BBox3D } from "@core/lib/geo";
import type { CachedNode } from "../../types";
import { pickNodeColors } from "./schemeBuffers";

/** Metadata needed to construct the output PointCloudData envelope. */
export interface RenderOutputMeta {
    coordinateOrigin: [number, number, number];
    bounds: BBox3D;
}

/** Everything a pack pass needs beyond the nodes themselves. */
export interface PackContext {
    scheme: ColorScheme;
    meta: RenderOutputMeta;
    /**
     * Classification codes excluded from packing. The set's identity is
     * the snapshot's staleness input — it is replaced only when the codes
     * change.
     */
    hidden: ReadonlySet<number>;
}

/** Commit the incoming part once it reaches this share of the base. */
const AUTO_COMMIT_RATIO = 0.25;
/** ...or this many points, whichever comes first. */
const AUTO_COMMIT_MIN_POINTS = 100_000;

const SHRINK_FACTOR = 4;
const HEADROOM_FACTOR = 2;

/** One packed buffer triple with capacity management. */
class PackedBuffers {
    positions: Float32Array | null = null;
    colors: Uint8Array | null = null;
    classifications: Uint8Array | null = null;
    capacity = 0;

    ensure(totalPoints: number): void {
        if (totalPoints > this.capacity) {
            this.allocate(
                Math.max(totalPoints, this.capacity * 2 || totalPoints),
            );
            return;
        }
        // Hysteresis: shrink only when usage fell to a quarter of the
        // allocation, and keep double headroom — a viewer diving back must
        // not re-trigger reallocation on every frame.
        if (
            this.capacity > 0 &&
            totalPoints > 0 &&
            this.capacity >= totalPoints * SHRINK_FACTOR
        ) {
            this.allocate(totalPoints * HEADROOM_FACTOR);
        }
    }

    private allocate(capacity: number): void {
        this.positions = new Float32Array(capacity * 3);
        this.colors = new Uint8Array(capacity * 4);
        this.classifications = new Uint8Array(capacity);
        this.capacity = capacity;
    }
}

/** What a committed snapshot freezes: the packed arrays it baked. */
interface CommittedSnapshot {
    /** Per key: the positions and scheme colors whose bytes were packed. */
    bakedByKey: Map<string, { positions: Float32Array; colors: Uint8Array }>;
    data: PointCloudData;
    ctx: PackContext;
}

/**
 * Two-part render buffer for streaming: a committed base plus a small
 * incoming part. Between commits the base envelope keeps its object
 * reference and its bytes stay untouched — the renderer skips re-uploading
 * it, and every push only packs the nodes arrived since (O(new) instead of
 * O(visible)). A commit folds the incoming nodes into a fresh base: one
 * full pack per cycle instead of one per progress push.
 *
 * The base is rebuilt (recommitted) whenever its frozen bytes would go
 * stale: a committed node left the visible set or lost its buffers, the
 * scheme changed (colors are baked per scheme), the hidden-class set
 * changed (kept points are baked per filter), or the metadata moved.
 */
export class RenderBufferPool {
    private readonly _base = new PackedBuffers();
    private readonly _incoming = new PackedBuffers();
    private _committed: CommittedSnapshot | null = null;

    /** Current base allocation, in points — exposed for tests. */
    get capacity(): number {
        return this._base.capacity;
    }

    /**
     * Build a frame for the visible set. When the committed base is still
     * valid, only the not-yet-committed nodes are packed into `incoming`
     * and `base` returns the frozen envelope; otherwise the whole set is
     * recommitted (and `incoming` comes back empty).
     */
    build(
        visibleKeys: string[],
        nodeCache: ReadonlyMap<string, CachedNode>,
        ctx: PackContext,
    ): PointCloudFrame | null {
        const visibleNodes = this._renderableNodes(
            visibleKeys,
            nodeCache,
            ctx.scheme,
        );
        if (visibleNodes.length === 0) {
            // Nothing renderable — drop the snapshot rather than pin dead arrays.
            this._committed = null;
            return null;
        }

        const committed = this._committed;
        if (committed && this._snapshotStale(committed, visibleNodes, ctx)) {
            this._committed = null;
        }

        if (!this._committed) {
            return this._commit(visibleNodes, ctx);
        }

        const snapshot = this._committed!;
        const incomingNodes = visibleNodes.filter(
            (n) => !snapshot.bakedByKey.has(n.key),
        );
        const incomingPoints = incomingNodes.reduce(
            (s, n) => s + n.pointCount,
            0,
        );

        // An incoming part approaching the base's size erases the win of
        // skipping its upload — fold it now instead of pushing it whole.
        // Raw point counts under an active filter: folding a touch early
        // beats a second counting pass over the incoming nodes.
        const autoCommitAt = Math.max(
            AUTO_COMMIT_MIN_POINTS,
            snapshot.data.pointCount * AUTO_COMMIT_RATIO,
        );
        if (incomingPoints > autoCommitAt) {
            return this._commit(visibleNodes, ctx);
        }

        if (incomingPoints === 0) {
            return { base: snapshot.data, incoming: null };
        }

        const incomingData = this._pack(this._incoming, incomingNodes, ctx);
        // A fully hidden incoming part keeps the old invariant — null, not
        // an empty envelope: the adapter would otherwise push a length-0
        // deck layer on every progress frame.
        return {
            base: snapshot.data,
            incoming: incomingData.pointCount > 0 ? incomingData : null,
        };
    }

    /** Fold everything visible into a fresh committed base. */
    commit(
        visibleKeys: string[],
        nodeCache: ReadonlyMap<string, CachedNode>,
        ctx: PackContext,
    ): PointCloudFrame | null {
        const visibleNodes = this._renderableNodes(
            visibleKeys,
            nodeCache,
            ctx.scheme,
        );
        if (visibleNodes.length === 0) {
            this._committed = null;
            return null;
        }
        return this._commit(visibleNodes, ctx);
    }

    private _commit(
        visibleNodes: CachedNode[],
        ctx: PackContext,
    ): PointCloudFrame {
        const data = this._pack(this._base, visibleNodes, ctx);
        const bakedByKey = new Map(
            visibleNodes.map((n) => [
                n.key,
                {
                    positions: n.positions!,
                    colors: pickNodeColors(n, ctx.scheme)!,
                },
            ]),
        );
        this._committed = {
            bakedByKey,
            data,
            ctx,
        };
        return { base: data, incoming: null };
    }

    /**
     * A snapshot goes stale when any of its bytes would change in place:
     * a committed node dropped out of the visible set, or its positions or
     * scheme colors were replaced (eviction and reload hand out new
     * arrays), or the baked colors/filter/metadata no longer match what is
     * asked for.
     */
    private _snapshotStale(
        snapshot: CommittedSnapshot,
        visibleNodes: CachedNode[],
        ctx: PackContext,
    ): boolean {
        const { scheme, hidden, meta } = ctx;
        if (snapshot.ctx.scheme !== scheme) return true;
        if (snapshot.ctx.hidden !== hidden) return true;
        if (
            snapshot.ctx.meta.coordinateOrigin !== meta.coordinateOrigin ||
            snapshot.ctx.meta.bounds !== meta.bounds
        ) {
            return true;
        }
        const visibleByKey = new Map(visibleNodes.map((n) => [n.key, n]));
        for (const [key, baked] of snapshot.bakedByKey) {
            const node = visibleByKey.get(key);
            if (!node) return true; // evicted or left the visible set
            if (
                node.positions !== baked.positions ||
                pickNodeColors(node, scheme) !== baked.colors
            ) {
                return true;
            }
        }
        return false;
    }

    private _renderableNodes(
        visibleKeys: string[],
        nodeCache: ReadonlyMap<string, CachedNode>,
        scheme: ColorScheme,
    ): CachedNode[] {
        const nodes = visibleKeys
            .map((k) => nodeCache.get(k)!)
            .filter((n) => n.positions && pickNodeColors(n, scheme));
        // Deterministic layout — the same set always packs identically.
        nodes.sort((a, b) => a.key.localeCompare(b.key));
        return nodes;
    }

    /**
     * Pack nodes into the buffer triple. A node participates only when it
     * holds both positions and the active scheme's color buffer —
     * lazily-derived buffers appear as the recolor path completes, so a
     * frame never mixes schemes or leaks stale bytes.
     */
    private _pack(
        buffers: PackedBuffers,
        nodes: CachedNode[],
        ctx: PackContext,
    ): PointCloudData {
        const totalPoints = nodes.reduce((s, n) => s + n.pointCount, 0);
        // Allocate for the raw size even under a filter: the pool held it
        // before the filter existed, and one pass without pre-counting
        // kept points beats a second counting walk over every node.
        buffers.ensure(totalPoints);

        const writeOffset =
            ctx.hidden.size === 0
                ? this._copyWhole(buffers, nodes, ctx.scheme)
                : this._compactVisible(buffers, nodes, ctx);

        return {
            positions: buffers.positions!.subarray(0, writeOffset * 3),
            coordinateOrigin: ctx.meta.coordinateOrigin,
            pointCount: writeOffset,
            colors: buffers.colors!.subarray(0, writeOffset * 4),
            classifications: buffers
                .classifications!.subarray(0, writeOffset),
            bounds: ctx.meta.bounds,
        };
    }

    /**
     * Bulk path — whole-node copies of positions, scheme colors and
     * classifications. A node without a classification channel packs as
     * code 0, matching the worker's zero-filled decode output.
     */
    private _copyWhole(
        buffers: PackedBuffers,
        nodes: CachedNode[],
        scheme: ColorScheme,
    ): number {
        const rp = buffers.positions!;
        const rc = buffers.colors!;
        const rcl = buffers.classifications!;
        let writeOffset = 0;
        for (const node of nodes) {
            rp.set(node.positions!, writeOffset * 3);
            rc.set(pickNodeColors(node, scheme)!, writeOffset * 4);
            const cls = node.classifications;
            if (cls) {
                rcl.set(cls, writeOffset);
            } else {
                rcl.fill(0, writeOffset, writeOffset + node.pointCount);
            }
            writeOffset += node.pointCount;
        }
        return writeOffset;
    }

    /**
     * Filtered path — hidden classes leave the packed bytes entirely, so
     * picking and measures served from the envelope lose them along with
     * the renderer. A node without a classification channel reads as code
     * 0 and filters like any never-classified point.
     */
    private _compactVisible(
        buffers: PackedBuffers,
        nodes: CachedNode[],
        ctx: PackContext,
    ): number {
        const rp = buffers.positions!;
        const rc = buffers.colors!;
        const rcl = buffers.classifications!;
        const { scheme, hidden } = ctx;
        let writeOffset = 0;
        for (const node of nodes) {
            const positions = node.positions!;
            const colors = pickNodeColors(node, scheme)!;
            const cls = node.classifications;
            for (let i = 0; i < node.pointCount; i++) {
                const code = cls ? cls[i]! : 0;
                if (hidden.has(code)) continue;
                const src3 = i * 3;
                const dst3 = writeOffset * 3;
                rp[dst3] = positions[src3]!;
                rp[dst3 + 1] = positions[src3 + 1]!;
                rp[dst3 + 2] = positions[src3 + 2]!;
                const src4 = i * 4;
                const dst4 = writeOffset * 4;
                rc[dst4] = colors[src4]!;
                rc[dst4 + 1] = colors[src4 + 1]!;
                rc[dst4 + 2] = colors[src4 + 2]!;
                rc[dst4 + 3] = colors[src4 + 3]!;
                rcl[writeOffset] = code;
                writeOffset++;
            }
        }
        return writeOffset;
    }
}
