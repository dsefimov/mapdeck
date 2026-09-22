import { ColorScheme } from "@core/contracts";
import type { PointCloudData } from "@core/contracts";
import type { BBox3D } from "@core/lib/geo";
import type { CachedNode } from "../../types";
import { pickNodeColors } from "./schemeBuffers";

/** Metadata needed to construct the output PointCloudData envelope. */
export interface RenderOutputMeta {
    coordinateOrigin: [number, number, number];
    bounds: BBox3D;
}

/**
 * Contiguous render buffer pool with hysteresis: grows to fit the visible
 * set, and — the part that keeps memory tracking the view rather than the
 * session's historical peak — shrinks back once usage falls far enough.
 * Builds packed Float32Array (positions) + Uint8Array (colors) per frame
 * from visible loaded nodes' per-node typed arrays.
 */
const SHRINK_FACTOR = 4;
const HEADROOM_FACTOR = 2;

export class RenderBufferPool {
    private _positions: Float32Array | null = null;
    private _colors: Uint8Array | null = null;
    private _capacity = 0;

    /** Current allocation, in points — exposed for tests and diagnostics. */
    get capacity(): number {
        return this._capacity;
    }

    /** Fit the allocation to `totalPoints`, growing or shrinking it. */
    private _ensureCapacity(totalPoints: number): void {
        if (totalPoints > this._capacity) {
            this._allocate(
                Math.max(totalPoints, this._capacity * 2 || totalPoints),
            );
            return;
        }
        // Hysteresis: shrink only when usage fell to a quarter of the
        // allocation, and keep double headroom — a viewer diving back must
        // not re-trigger reallocation on every frame.
        if (
            this._capacity > 0 &&
            totalPoints > 0 &&
            this._capacity >= totalPoints * SHRINK_FACTOR
        ) {
            this._allocate(totalPoints * HEADROOM_FACTOR);
        }
    }

    private _allocate(capacity: number): void {
        this._positions = new Float32Array(capacity * 3);
        this._colors = new Uint8Array(capacity * 4);
        this._capacity = capacity;
    }

    /**
     * Build a contiguous render buffer from visible cached nodes.
     * A node participates only when it holds both positions and the active
     * scheme's color buffer — lazily-derived buffers appear as the recolor
     * path completes, so a frame never mixes schemes or leaks stale bytes.
     * Returns null if no visible node is renderable.
     */
    build(
        visibleKeys: string[],
        nodeCache: ReadonlyMap<string, CachedNode>,
        scheme: ColorScheme,
        meta: RenderOutputMeta,
    ): PointCloudData | null {
        const visibleNodes = visibleKeys
            .map((k) => nodeCache.get(k)!)
            .filter((n) => n.positions && pickNodeColors(n, scheme));

        const totalPoints = visibleNodes.reduce((s, n) => s + n.pointCount, 0);
        if (totalPoints === 0) return null;

        this._ensureCapacity(totalPoints);

        const rp = this._positions!;
        const rc = this._colors!;
        let writeOffset = 0;

        visibleNodes.sort((a, b) => a.key.localeCompare(b.key));

        for (const node of visibleNodes) {
            rp.set(
                node.positions!,
                writeOffset * 3,
            );
            rc.set(pickNodeColors(node, scheme)!, writeOffset * 4);
            writeOffset += node.pointCount;
        }

        return {
            positions: rp.subarray(0, totalPoints * 3),
            coordinateOrigin: meta.coordinateOrigin,
            pointCount: totalPoints,
            colors: rc.subarray(0, totalPoints * 4),
            bounds: meta.bounds,
        };
    }
}
