/**
 * One place for the protocol HTTP dance: bounded fetch with a ceiling and
 * cancellation, status check, and an error that names the caller. The three
 * OGC-ish clients (WMS, WFS, OGC Features) must not re-implement it — a
 * divergence here is a divergent failure message for the same failure.
 */
import { boundedFetch } from "@core/lib/async/boundedFetch";

/** Fetch with a timeout ceiling, aborting signal, and a checked status. */
export async function fetchChecked(
    url: string,
    options: {
        /** Names the protocol in the thrown error, e.g. "WFS GetFeature". */
        label: string;
        headers?: Record<string, string> | undefined;
        signal?: AbortSignal | undefined;
        timeoutMs: number;
    },
): Promise<Response> {
    const response = await boundedFetch(url, {
        headers: options.headers,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
    });

    if (!response.ok) {
        throw new Error(
            `${options.label} returned ${response.status} ${response.statusText}`,
        );
    }

    return response;
}
