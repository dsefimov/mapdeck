import type { CachedNode } from "../../types";

/**
 * Delete every render buffer a node may hold — the single list shared by
 * eviction and load-failure cleanup, so the two can never drift apart.
 */
export function clearNodeBuffers(node: CachedNode): void {
    delete node.positions;
    delete node.colorsRgb;
    delete node.colorsElevation;
    delete node.colorsIntensity;
    delete node.colorsClassification;
    delete node.intensities;
    delete node.classifications;
}

/**
 * Clear all render data from a cached node, reset its state to "pending",
 * and remove it from the error keys set.
 *
 * Mutates `node` and `errorKeys` in-place. Returns the pointCount that was freed.
 */
export function clearTileData(
    node: CachedNode,
    errorKeys: Set<string>,
): number {
    const freed = node.pointCount;

    node.state = "pending";
    clearNodeBuffers(node);
    errorKeys.delete(node.key);

    return freed;
}
