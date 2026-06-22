import { ColorScheme } from "@core/framework/types";
import type { CachedNode, PointCloudData, BBox3D } from "@core/framework/types";

/** Metadata needed to construct the output PointCloudData envelope. */
export interface RenderOutputMeta {
    coordinateOrigin: [number, number, number];
    bounds: BBox3D;
}

/**
 * Grow-only contiguous render buffer pool.
 * Builds packed Float32Array (positions) + Uint8Array (colors) per frame
 * from visible loaded nodes' per-node typed arrays.
 */
export class RenderBufferPool {
    private _positions: Float32Array | null = null;
    private _colors: Uint8Array | null = null;
    private _capacity = 0;

    /** Grow buffer capacity to accommodate at least `totalPoints`. */
    private _ensureCapacity(totalPoints: number): void {
        if (totalPoints <= this._capacity) return;

        const newCap = Math.max(totalPoints, this._capacity * 2 || totalPoints);
        this._positions = new Float32Array(newCap * 3);
        this._colors = new Uint8Array(newCap * 4);
        this._capacity = newCap;
    }

    /** Pick the per-node color array for the active scheme. */
    private _pickColors(
        node: CachedNode,
        scheme: ColorScheme,
    ): Uint8Array | undefined {
        switch (scheme) {
            case ColorScheme.ELEVATION:
                return node.colorsElevation;
            case ColorScheme.INTENSITY:
                return node.colorsIntensity;
            case ColorScheme.CLASSIFICATION:
                return node.colorsClassification;
            case ColorScheme.RGB:
            default:
                return node.colorsRgb;
        }
    }

    /**
     * Build a contiguous render buffer from visible cached nodes.
     * Returns null if no visible node has renderable data.
     */
    build(
        visibleKeys: string[],
        nodeCache: ReadonlyMap<string, CachedNode>,
        scheme: ColorScheme,
        meta: RenderOutputMeta,
    ): PointCloudData | null {
        const visibleNodes = visibleKeys
            .map((k) => nodeCache.get(k)!)
            .filter((n) => n.positions);

        const totalPoints = visibleNodes.reduce((s, n) => s + n.pointCount, 0);
        if (totalPoints === 0) return null;

        this._ensureCapacity(totalPoints);

        const rp = this._positions!;
        const rc = this._colors!;
        let writeOffset = 0;

        visibleNodes.sort((a, b) => a.key.localeCompare(b.key));

        for (const node of visibleNodes) {
            const np = node.pointCount;
            rp.set(node.positions!, writeOffset * 3);
            const src = this._pickColors(node, scheme);
            if (src) {
                rc.set(src, writeOffset * 4);
            }
            writeOffset += np;
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
