/**
 * Retry decision after eviction.
 * Pure function — deterministic, no side effects.
 *
 * A follow-up cycle should only be scheduled if eviction freed at least
 * one point — otherwise the next cycle with identical input would produce
 * identical results, leading to an infinite retry loop.
 *
 * The unserved demand matters as much as the freed room: the plan is
 * computed before eviction runs, so an over-spent budget starves `toLoad`
 * (to nothing, or past the truncation cut) even though the eviction right
 * after it frees points. Without a retry that budget sits idle until the
 * next camera move — a resting camera stares at a coarse fallback.
 *
 * The retry is bounded: eviction only frees nodes the recent cycles
 * stopped touching, and under a fixed camera those never reload — the
 * evictable set only shrinks, so `freedPoints` reaches zero and the loop
 * ends.
 */
export function shouldRetryAfterEviction(
    finalToLoadCount: number,
    pendingDemandCount: number,
    freedPoints: number,
): boolean {
    return freedPoints > 0 && finalToLoadCount < pendingDemandCount;
}
