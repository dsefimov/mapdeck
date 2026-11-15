/**
 * Depth bookkeeping for a streaming cycle: per-depth node counts and the
 * deepest depth seen, both driven by hierarchy discovery.
 */

/**
 * Counts a discovered node's depth into the distribution and raises the
 * max-depth watermark. Mutates `distribution` in place; returns the watermark.
 */
export function recordNodeDepth(
    distribution: Map<number, number>,
    maxDepth: number,
    depth: number,
): number {
    distribution.set(depth, (distribution.get(depth) ?? 0) + 1);
    return Math.max(maxDepth, depth);
}
