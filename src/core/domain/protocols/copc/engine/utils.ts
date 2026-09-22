/**
 * The retry lifecycle of a failed node load: how long to wait, and when the
 * waiting starts over.
 */

import type { CachedNode } from "../types";

/** Chrome-only text marker: the HTTP cache refused an opaque request. */
const CACHE_UNSUPPORTED_MARKER = "ERR_CACHE_OPERATION_NOT_SUPPORTED";

const DEFAULT_BASE_DELAY_MS = 1_000;
const CACHE_ERROR_BASE_DELAY_MS = 10_000;
const MAX_RETRY_DELAY_MS = 60_000;

/**
 * Compute the retry delay in milliseconds for a node that failed to load.
 *
 * @param errorMessage - The error message string (from node.error).
 * @param retryCount - Number of consecutive prior retries.
 * @returns Delay in milliseconds before next retry attempt.
 */
export function computeRetryDelay(
    errorMessage: string,
    retryCount: number,
): number {
    // Browsers report an unsupported cache operation only through this text
    // — there is no error code to check. Retrying such failures sooner than
    // the cache backoff reliably hits the same wall.
    const isCacheError = errorMessage.includes(
        CACHE_UNSUPPORTED_MARKER,
    );
    const baseDelay = isCacheError
        ? CACHE_ERROR_BASE_DELAY_MS
        : DEFAULT_BASE_DELAY_MS;
    return Math.min(baseDelay * Math.pow(2, retryCount), MAX_RETRY_DELAY_MS);
}

/**
 * Record a failed load on the node and schedule its next attempt.
 *
 * `now` is passed in rather than read from the clock so the schedule is a
 * function of its inputs alone.
 *
 * @param node - The node that failed; its retry fields are mutated in place.
 * @param errorMessage - Message the failure carried, kept for the next attempt.
 * @param now - Current epoch milliseconds.
 */
export function scheduleRetry(
    node: CachedNode,
    errorMessage: string,
    now: number,
): void {
    node.error = errorMessage;
    node.retryAt = now + computeRetryDelay(errorMessage, node.retryCount ?? 0);
    node.retryCount = (node.retryCount ?? 0) + 1;
}

/**
 * Clear a node's backoff history after it loads successfully.
 *
 * A success ends the streak the delay is counted from: without this the count
 * only ever rises, so one transient failure would keep lengthening every later
 * retry until it hit the 60 s cap, and the tile would never recover its
 * responsiveness for the rest of the session.
 *
 * @param node - The node that just loaded; its retry fields are removed.
 */
export function clearRetryState(node: CachedNode): void {
    delete node.retryCount;
    delete node.retryAt;
}
