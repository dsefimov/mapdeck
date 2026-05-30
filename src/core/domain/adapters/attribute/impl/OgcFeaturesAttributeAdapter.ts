import type {
    AttributeDataAdapter,
    AttributeFetchRequest,
    AttributeSourceConfig,
    AttributeFetchResult,
} from "@core/framework/types";
import { fetchOgcFeaturesPage } from "@core/shared/protocols/ogc/features";

/** Maximum number of features per single request. */
const MAX_PAGE_SIZE = 500;

/** Minimum interval between consecutive requests (ms). */
const RATE_LIMIT_MS = 1000;

export class OgcFeaturesAttributeAdapter implements AttributeDataAdapter {
    private lastRequestTime = 0;

    async fetchPage(
        config: AttributeSourceConfig,
        request: AttributeFetchRequest,
        signal?: AbortSignal,
    ): Promise<AttributeFetchResult> {
        // Rate limiting: ensure at least RATE_LIMIT_MS between requests
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < RATE_LIMIT_MS) {
            const delay = RATE_LIMIT_MS - elapsed;
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        this.lastRequestTime = Date.now();

        const limit = Math.min(request.maxFeatures ?? 50, MAX_PAGE_SIZE);
        const result = await fetchOgcFeaturesPage(
            {
                url: config.endpointUrl,
                offset: request.startIndex ?? 0,
                limit,
            },
            signal,
        );

        return { rows: result.features, totalFeatures: result.totalFeatures };
    }
}
