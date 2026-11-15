/**
 * Pure WFS GeoJSON response parser.
 * No side effects — only data transformation.
 */

import type { WfsFeature, WfsResponse } from "./types";
import { parseFeature as normalizeFeature } from "../logic/parseFeature";
import { estimateTotal } from "../logic/estimateTotal";

/** Pagination context needed to interpret a single page of features. */
export interface WfsPageContext {
    /** Requested page size (maxFeatures); undefined when unpaginated. */
    pageSize?: number | undefined;
    /** 0-based start index of this page. */
    offset?: number | undefined;
}

/**
 * Parse GeoJSON response into WfsResponse.
 */
export function parseGeoJsonResponse(
    json: unknown,
    pagination: WfsPageContext = {},
): WfsResponse {
    if (!json || typeof json !== "object") {
        return { features: [], totalFeatures: 0 };
    }

    const data = json as Record<string, unknown>;
    const features = parseGeoJsonFeatures(data);

    return {
        features,
        totalFeatures: estimateTotal(
            data.numberMatched,
            features.length,
            pagination.offset ?? 0,
            pagination.pageSize ?? Number.POSITIVE_INFINITY,
        ),
    };
}

/**
 * Extract features from GeoJSON FeatureCollection.
 */
export function parseGeoJsonFeatures(
    data: Record<string, unknown>,
): WfsFeature[] {
    if (!Array.isArray(data.features)) return [];

    const features: WfsFeature[] = [];
    for (const feature of data.features) {
        const parsed = normalizeFeature(feature);
        if (parsed) {
            features.push(parsed);
        }
    }
    return features;
}
