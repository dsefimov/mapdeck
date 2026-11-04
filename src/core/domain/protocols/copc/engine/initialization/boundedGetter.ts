/**
 * HTTP range getters with a time ceiling, cancellation and no-store caching.
 *
 * copc.js's `Getter` is a bare byte-range callback with no cancellation
 * channel, and its HTTP variant fetches without a signal — a hung
 * range-request would hold one of the four load slots forever. The wrappers
 * below rebuild the same wire format (`Range: bytes=begin-(end-1)`) on top
 * of `boundedFetch`, which aborts on expiry and rejects with a
 * distinguishable error.
 *
 * Every getter sends `cache: "no-store"`: a range response is unique bytes
 * (the HTTP cache can never satisfy it), while Chrome's disk cache
 * intermittently *fails* ranged 206 responses outright —
 * ERR_CACHE_OPERATION_NOT_SUPPORTED — which would otherwise stall node
 * loads behind long retry backoffs.
 */
import type { Getter } from "copc";
import { boundedFetch } from "@core/lib/async/boundedFetch";

/**
 * Wrap a source for one load. Buffer/File getters read memory and cannot
 * hang — an aborted load of theirs is discarded by the node's state guard
 * on settle, so they pass through untouched.
 */
export function createBoundedGetter(
    source: string | Getter,
    signal: AbortSignal,
    timeoutMs: number,
): Getter {
    if (typeof source !== "string") return source;

    return async (begin, end) => {
        const response = await boundedFetch(source, {
            headers: { Range: `bytes=${begin}-${end - 1}` },
            signal,
            timeoutMs,
            cache: "no-store",
        });
        return new Uint8Array(await response.arrayBuffer());
    };
}

/**
 * Shared getter for a URL source without per-load cancellation — the header
 * read in `Copc.create` and the hierarchy pages. Those have no abort channel
 * in copc.js, so they get the time ceiling and no-store, and per-load
 * cancellation stays with {@link createBoundedGetter} for node data.
 */
export function createHttpRangeGetter(
    source: string,
    timeoutMs: number,
): Getter {
    return async (begin, end) => {
        const response = await boundedFetch(source, {
            headers: { Range: `bytes=${begin}-${end - 1}` },
            timeoutMs,
            cache: "no-store",
        });
        return new Uint8Array(await response.arrayBuffer());
    };
}
