import type { AttributeFetchResult, FeatureRow } from "@core/contracts";

/** The store's cache-entry shape, kept structural so both sides agree. */
export interface AttributePage {
    features: FeatureRow[];
    totalFeatures: number;
}

/**
 * Folds a fetched page into the cached set: the first page (startIndex 0)
 * replaces whatever was cached — a refresh or a new sort — later pages
 * append.
 */
export function mergeAttributePage(
    prev: readonly FeatureRow[] | undefined,
    result: AttributeFetchResult,
    startIndex: number,
): AttributePage {
    return {
        features:
            startIndex === 0
                ? result.features
                : [...(prev ?? []), ...result.features],
        totalFeatures: result.totalFeatures,
    };
}
