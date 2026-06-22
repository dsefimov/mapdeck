/**
 * Priority normalization: min-max bounds tracking and [0,1] clamping.
 */

/** Bounds for normalizing continuous priority criteria across the visible tile set. */
export interface PriorityBounds {
    minDistance: number;
    maxDistance: number;
    minDepth: number;
    maxDepth: number;
    minFoveatedFactor: number;
    maxFoveatedFactor: number;
    minReverseSSE: number;
    maxReverseSSE: number;
}

const EPSILON7 = 1e-7;

/**
 * Normalize a value to [0, 1] range and clamp, subtracting EPSILON7
 * to prevent exactly 0 or 1 (except when min === max).
 */
export function priorityNormalizeAndClamp(
    value: number,
    minimum: number,
    maximum: number,
): number {
    if (minimum === maximum) return 0.0;
    const normalized = (value - minimum) / (maximum - minimum);
    return Math.max(0.0, Math.min(1.0, normalized - EPSILON7));
}
