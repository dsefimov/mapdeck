/**
 * WFS client — fetch layer with error handling.
 * Depends on pure URL builder and parser.
 */

import type {
    WfsRequestParams,
    WfsResponse,
} from "./types";
import type { GeoJSONGeometry } from "@core/lib/geo";
import { buildWfsUrl } from "./url";
import { parseGeoJsonResponse } from "./parser";
import { logger } from "@core/lib/logger";
import { fetchChecked } from "../shared/http";
import type { FeatureRow } from "@core/contracts";
import { featureToRow } from "../logic/featureToRow";

/** A hung WFS endpoint must not pin an attribute-table session. */
const WFS_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Fetch features from a WFS endpoint with pagination support.
 */
export async function fetchWfsFeatures(
    params: WfsRequestParams,
    signal?: AbortSignal,
): Promise<WfsResponse> {
    const url = buildWfsUrl(params);

    logger.debug(`WFS request: ${url}`);

    try {
        const response = await fetchChecked(url, {
            label: "WFS GetFeature",
            signal,
            timeoutMs: WFS_REQUEST_TIMEOUT_MS,
        });

        const contentType = response.headers.get("content-type") ?? "";

        if (!contentType.includes("application/json")) {
            const text = await response.text();
            try {
                const json = JSON.parse(text);
                return parseGeoJsonResponse(json, {
                    pageSize: params.maxFeatures,
                    offset: params.startIndex,
                });
            } catch {
                throw new Error(
                    `WFS response was not JSON (content-type: ${contentType})`,
                );
            }
        }

        const json = await response.json();
        return parseGeoJsonResponse(json, {
            pageSize: params.maxFeatures,
            offset: params.startIndex,
        });
    } catch (error) {
        logger.error("WFS request failed:", error);
        throw error;
    }
}

/**
 * Fetch a single page of features and return them as flat attribute features.
 */
export async function fetchWfsPageAsFeatures(
    params: WfsRequestParams,
    signal?: AbortSignal,
): Promise<{ features: FeatureRow[]; totalFeatures: number }> {
    const response = await fetchWfsFeatures(params, signal);

    const features = response.features.map((f) =>
        featureToRow(f.geometry as GeoJSONGeometry | null, f.properties),
    );

    return { features, totalFeatures: response.totalFeatures };
}
