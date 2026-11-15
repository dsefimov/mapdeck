/** Raised when the {@link boundedFetch} time ceiling fires. */
export class FetchTimeoutError extends Error {
    constructor(
        readonly url: string,
        readonly timeoutMs: number,
    ) {
        super(`Request timed out after ${timeoutMs}ms: ${url}`);
        this.name = "FetchTimeoutError";
    }
}

export interface BoundedFetchOptions {
    headers?: HeadersInit | undefined;
    method?: string | undefined;
    cache?: RequestCache | undefined;
    /** Hard ceiling covering headers and body; omit for no ceiling. */
    timeoutMs?: number | undefined;
    signal?: AbortSignal | undefined;
}

/**
 * Fetch with a hard time ceiling and optional external cancellation.
 *
 * The ceiling and the caller's signal cover the whole request — headers
 * and body alike: if the ceiling fires while the caller is still
 * reading the body, the body read rejects with the native
 * `TimeoutError` (a caller's abort — with the native `AbortError`). A
 * timeout on the request itself rejects with {@link FetchTimeoutError}.
 */
export async function boundedFetch(
    url: string,
    options: BoundedFetchOptions = {},
): Promise<Response> {
    const { timeoutMs, signal: callerSignal, ...init } = options;
    const signals = [
        callerSignal,
        timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
    ].filter((signal): signal is AbortSignal => signal !== undefined);

    // exactOptionalPropertyTypes: a `| undefined` property cannot be
    // spread into RequestInit's optional properties — assign each one.
    const request: RequestInit = {};
    if (init.headers !== undefined) request.headers = init.headers;
    if (init.method !== undefined) request.method = init.method;
    if (init.cache !== undefined) request.cache = init.cache;
    if (signals.length > 0) request.signal = AbortSignal.any(signals);

    try {
        return await fetch(url, request);
    } catch (error) {
        // Own ceiling armed and it fired — wrap it. A caller-owned
        // AbortSignal.timeout rethrows as-is: it is not ours to retype.
        // The name check avoids cross-realm DOMException mismatches.
        const timedOut =
            timeoutMs !== undefined &&
            (error as { name?: unknown }).name === "TimeoutError";
        if (timedOut) throw new FetchTimeoutError(url, timeoutMs);
        throw error;
    }
}
