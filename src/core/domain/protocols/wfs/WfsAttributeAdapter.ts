import type {
    AttributeAdapter,
    AttributeFetchRequest,
    AttributeFetchResult,
    ProtocolBinding,
} from "@core/contracts";
import { fetchWfsPageAsFeatures } from ".";

/** Attribute-table page served when the request names no size. */
const DEFAULT_MAX_FEATURES = 50;

/**
 * Attribute-table adapter for WFS layers: maps a table request (paging,
 * sorting) onto a WFS GetFeatures page and returns its rows.
 */
export class WfsAttributeAdapter implements AttributeAdapter {
    async fetchAttributes(
        binding: ProtocolBinding,
        request: AttributeFetchRequest,
        signal?: AbortSignal,
    ): Promise<AttributeFetchResult> {
        const params = binding.params ?? {};
        const result = await fetchWfsPageAsFeatures(
            {
                url: binding.sourceUrl,
                version:
                    typeof params.version === "string"
                        ? params.version
                        : "2.0.0",
                startIndex: request.startIndex ?? 0,
                maxFeatures: request.maxFeatures ?? DEFAULT_MAX_FEATURES,
                sortBy: request.sortBy,
                sortDirection: request.sortDirection,
            },
            signal,
        );

        return {
            features: result.features,
            totalFeatures: result.totalFeatures,
        };
    }
}
