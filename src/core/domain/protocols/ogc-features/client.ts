import type { GeoJSONGeometry } from "@core/lib/geo";
import { logger } from "@core/lib/logger";
import { fetchChecked } from "../shared/http";
import type { FeatureRow } from "@core/contracts";
import { estimateTotal } from "../logic/estimateTotal";
import { featureToRow } from "../logic/featureToRow";
import { appendUrlParams } from "../logic/appendUrlParams";

/** A hung OGC endpoint must not pin a pager session. */
const OGC_REQUEST_TIMEOUT_MS = 20_000;

/** Page size served when the request does not name a limit. */
export const DEFAULT_PAGE_LIMIT = 50;

/** Parameters of one OGC API - Features page fetch. */
export interface OgcFeaturesParams {
    url: string;
    offset?: number;
    limit?: number;
}

/** One page of flattened feature rows plus the pager total. */
export interface OgcFeaturesPage {
    features: FeatureRow[];
    totalFeatures: number;
}

/** Wire shape of an OGC API - Features FeatureCollection we rely on. */
interface FeatureCollectionPayload {
    features: Array<{
        id?: string | number;
        geometry?: GeoJSONGeometry | null;
        properties?: Record<string, unknown> | null;
    }>;
    numberReturned?: number;
    numberMatched?: number | undefined;
}

/** Attach offset/limit pagination parameters to the collection URL. */
function buildRequestUrl(params: OgcFeaturesParams): string {
    return appendUrlParams(params.url, {
        offset: String(params.offset ?? 0),
        limit: String(params.limit ?? DEFAULT_PAGE_LIMIT),
    });
}

/**
 * Validate an unknown JSON payload as a FeatureCollection and normalize
 * it into a trusted shape. Throws with a service-facing message when
 * the shape is wrong.
 */
function assertFeatureCollection(data: unknown): FeatureCollectionPayload {
    if (
        !data ||
        typeof data !== "object" ||
        !("features" in data) ||
        !Array.isArray((data as Record<string, unknown>).features)
    ) {
        throw new Error(
            "OGC Features response is not a valid FeatureCollection",
        );
    }
    const fc = data as FeatureCollectionPayload;
    return { ...fc, numberMatched: fc.numberMatched ?? undefined };
}

/**
 * Fetch a page of features from an OGC API Features endpoint.
 * Uses offset/limit pagination as per OGC API - Features spec.
 */
export async function fetchOgcFeaturesPage(
    params: OgcFeaturesParams,
    signal?: AbortSignal,
): Promise<OgcFeaturesPage> {
    const requestUrl = buildRequestUrl(params);

    logger.debug(`OGC Features request: ${requestUrl}`);

    try {
        const response = await fetchChecked(requestUrl, {
            label: "OGC Features",
            headers: { Accept: "application/geo+json" },
            signal: signal ?? undefined,
            timeoutMs: OGC_REQUEST_TIMEOUT_MS,
        });

        const payload = assertFeatureCollection(await response.json());
        const features = payload.features.map((f) =>
            featureToRow(f.geometry ?? null, f.properties),
        );

        return {
            features,
            totalFeatures: estimateTotal(
                payload.numberMatched,
                features.length,
                params.offset ?? 0,
                params.limit ?? DEFAULT_PAGE_LIMIT,
            ),
        };
    } catch (error) {
        logger.error("OGC Features request failed:", error);
        throw error;
    }
}
