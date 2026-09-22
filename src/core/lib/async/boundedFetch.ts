/**
 * Fetch with a hard time ceiling and external cancellation.
 *
 * A hung server rejects with a "timed out" error (distinguishable from a
 * caller's abort); an aborted external signal rejects with the native
 * AbortError. Timer and listeners are always cleaned up.
 */
/** Wire an external abort signal into the controller; returns unbind. */
function linkSignal(
    controller: AbortController,
    signal: AbortSignal | undefined,
): () => void {
    if (!signal) return () => {};
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    return () => signal.removeEventListener("abort", onAbort);
}

/** Arm the time ceiling; returns disarm. */
function armTimeout(
    controller: AbortController,
    timeoutMs: number | undefined,
): () => void {
    if (timeoutMs === undefined) return () => {};
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return () => clearTimeout(timer);
}

export async function boundedFetch(
    url: string,
    init: {
        headers?: Record<string, string> | undefined;
        /** Hard ceiling for the whole request; omit for no ceiling. */
        timeoutMs?: number | undefined;
        /** Caller-owned cancellation (consumer removed, superseded batch...). */
        signal?: AbortSignal | undefined;
        method?: string | undefined;
    } = {},
): Promise<Response> {
    const controller = new AbortController();
    const disarmTimeout = armTimeout(controller, init.timeoutMs);
    const unlinkSignal = linkSignal(controller, init.signal);

    try {
        return await fetch(url, {
            ...(init.headers !== undefined ? { headers: init.headers } : {}),
            ...(init.method !== undefined ? { method: init.method } : {}),
            signal: controller.signal,
        });
    } catch (error) {
        // Both the timer and the caller's signal abort the controller — and
        // an armed ceiling is not proof it fired (a network TypeError
        // rejects long before it), so ask the controller who aborted it.
        if (
            init.timeoutMs !== undefined &&
            controller.signal.aborted &&
            !init.signal?.aborted
        ) {
            throw new Error(
                `Request timed out after ${init.timeoutMs}ms: ${url}`,
            );
        }
        throw error;
    } finally {
        disarmTimeout();
        unlinkSignal();
    }
}
