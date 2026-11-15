import type {
    AttributeAdapter,
    AttributeFetchRequest,
    AttributeFetchResult,
    ProtocolBinding,
} from "@core/contracts";
import {
    DEFAULT_PAGE_LIMIT,
    fetchOgcFeaturesPage,
} from ".";

/** Maximum number of features per single request. */
const MAX_PAGE_SIZE = 500;

/** Minimum interval between consecutive requests (ms). OGC servers answer
 *  bursts of attribute pages with 429s or hangs. */
const RATE_LIMIT_MS = 1000;

export class OgcFeaturesAttributeAdapter implements AttributeAdapter {
    /** Earliest moment the next request may leave. Reserved before the
     *  wait, so concurrent callers space out instead of waking together. */
    private nextAllowedAt = 0;

    async fetchAttributes(
        binding: ProtocolBinding,
        request: AttributeFetchRequest,
        signal?: AbortSignal,
    ): Promise<AttributeFetchResult> {
        if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }

        const now = Date.now();
        const scheduledAt = Math.max(now, this.nextAllowedAt);
        this.nextAllowedAt = scheduledAt + RATE_LIMIT_MS;

        if (scheduledAt > now) {
            // Race the wait against the abort signal: an aborted caller
            // must not sleep out the rate-limit interval.
            await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, scheduledAt - now);
                signal?.addEventListener(
                    "abort",
                    () => {
                        clearTimeout(timer);
                        resolve();
                    },
                    { once: true },
                );
            });
            if (signal?.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }
        }

        const limit = Math.min(
            request.maxFeatures ?? DEFAULT_PAGE_LIMIT,
            MAX_PAGE_SIZE,
        );
        const result = await fetchOgcFeaturesPage(
            {
                url: binding.sourceUrl,
                offset: request.startIndex ?? 0,
                limit,
            },
            signal,
        );

        return {
            features: result.features,
            totalFeatures: result.totalFeatures,
        };
    }
}
