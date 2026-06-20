/**
 * Retry decision after toLoad truncation.
 * Pure function — deterministic, no side effects.
 *
 * A follow-up cycle should only be scheduled if eviction freed at least
 * one point — otherwise the next cycle with identical input would produce
 * identical results, leading to an infinite retry loop.
 *
 * @param finalToLoadCount - Number of nodes actually enqueued after truncation.
 * @param plannedToLoadCount - Number of nodes that were in the original plan.
 * @param freedPoints - Points freed by eviction in this cycle.
 */
export function shouldRetryAfterTruncation(
    finalToLoadCount: number,
    plannedToLoadCount: number,
    freedPoints: number,
): boolean {
    return finalToLoadCount < plannedToLoadCount && freedPoints > 0;
}
