/**
 * Settle decision after a cycle's drain. Pure function — deterministic.
 *
 * The drain can push residency past the eviction target that was computed
 * before it ran. While the view's demand is still unserved, one more cycle
 * evicts what the view no longer holds and reinvests the freed budget —
 * a resting camera converges instead of parking the over-spend.
 *
 * The progress guard terminates the chain: a cycle that neither evicted
 * nor enqueued anything leaves the next cycle with identical state, so
 * retrying would spin forever. A productive chain is bounded the other
 * way — evictable non-candidates never reload under a fixed camera, and
 * pending demand is finite.
 */
/** What the settle decision needs to know about the finished cycle. */
export interface SettleCheck {
    /** Nodes this cycle actually enqueued for loading. */
    enqueuedCount: number;
    /** Nodes this cycle evicted. */
    evictedCount: number;
    /** Points the view still wants after the drain. */
    pendingDemandPoints: number;
    /** Resident points after the drain. */
    totalPoints: number;
    /** The eviction target computed before the drain ran. */
    targetPoints: number;
}

/** Retry decision after a cycle's drain — see the module comment. */
export function shouldSettleRetry(check: SettleCheck): boolean {
    return (
        check.pendingDemandPoints > 0 &&
        check.totalPoints > check.targetPoints &&
        (check.enqueuedCount > 0 || check.evictedCount > 0)
    );
}
