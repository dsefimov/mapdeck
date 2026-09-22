/**
 * Per-load Getter with a time ceiling and real cancellation.
 *
 * copc.js's `Getter` is a bare byte-range callback with no cancellation
 * channel, and its HTTP variant fetches without a signal — a hung
 * range-request would hold one of the four load slots forever. The wrapper
 * rebuilds the same wire format (`Range: bytes=begin-(end-1)`) on top of
 * `boundedFetch`, which aborts on expiry and rejects with a distinguishable
 * error, and forwards the per-load signal so `NodeLoader.cancelStale`
 * cancels the request itself, not just its bookkeeping.
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
        });
        return new Uint8Array(await response.arrayBuffer());
    };
}
