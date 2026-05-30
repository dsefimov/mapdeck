import type { GeoJSONGeometry } from "@core/framework/types/geo";
import { logger } from "@core/shared/diagnostics/logger";
import { bboxFromGeometry } from "@core/shared/geo";

export interface OgcFeaturesParams {
    url: string;
    offset?: number;
    limit?: number;
}

/**
 * Fetch a page of features from an OGC API Features endpoint.
 * Uses offset/limit pagination as per OGC API - Features spec.
 */
export async function fetchOgcFeaturesPage(
    params: OgcFeaturesParams,
    signal?: AbortSignal,
): Promise<{ features: Record<string, unknown>[]; totalFeatures: number }> {
    const { url, offset = 0, limit = 50 } = params;

    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set("offset", String(offset));
    parsedUrl.searchParams.set("limit", String(limit));

    logger.debug(`OGC Features request: ${parsedUrl.toString()}`);

    try {
        const init: RequestInit = {
            headers: { Accept: "application/geo+json" },
            ...(signal ? { signal } : {}),
        };
        const response = await globalThis.fetch(parsedUrl.toString(), init);

        if (!response.ok) {
            throw new Error(
                `OGC Features returned ${response.status} ${response.statusText}`,
            );
        }

        const data: unknown = await response.json();

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

        const fc = data as {
            features: Array<{
                id?: string | number;
                geometry?: GeoJSONGeometry | null;
                properties?: Record<string, unknown> | null;
            }>;
            numberReturned?: number;
            numberMatched?: number;
        };

        const rows: Record<string, unknown>[] = fc.features.map((f) => {
            const row: Record<string, unknown> = {
                _id: f.id ?? null,
                ...(f.properties ?? {}),
            };

            const bbox = bboxFromGeometry(f.geometry ?? null);
            if (bbox) {
                row._bbox = bbox;
            }

            return row;
        });

        const count = fc.features.length;
        const requestedLimit = params.limit ?? 50;

        // When numberMatched is available, use the precise total.
        // Otherwise, assume the next page exists as long as this page
        // returned a full batch — the last page will have fewer items.
        const totalFeatures =
            fc.numberMatched ??
            (count >= requestedLimit ? offset + count + 1 : offset + count);

        return {
            features: rows,
            totalFeatures,
        };
    } catch (error) {
        logger.error("OGC Features request failed:", error);
        throw error;
    }
}
