/**
 * WFS-specific types for feature fetching and pagination.
 * Pure contracts — no business logic.
 */

/** One GeoJSON-shaped feature of a WFS response. */
export interface WfsFeature {
    /** Feature ID from WFS response */
    id: string;
    /** Feature properties as key-value pairs */
    properties: Record<string, unknown>;
    /** GeoJSON geometry object (may be null) */
    geometry: Record<string, unknown> | null;
}

/** One page of WFS features plus the total count. */
export interface WfsResponse {
    /** Loaded features (page) */
    features: WfsFeature[];
    /** Total number of features available (from WFS response) */
    totalFeatures: number;
}

/** Parameters of a WFS GetFeature request. */
export interface WfsRequestParams {
    /** WFS endpoint URL (should already contain typeName and other required params) */
    url: string;
    /** WFS version to use (default: 2.0.0) */
    version?: string | undefined;
    /** Number of features to return (pagination) */
    maxFeatures?: number | undefined;
    /** Starting index for pagination (0-based) */
    startIndex?: number | undefined;
    /** Optional CQL filter expression */
    cqlFilter?: string | undefined;
    /** Optional SRS name */
    srsName?: string | undefined;
    /** Optional sort column */
    sortBy?: string | undefined;
    /** Optional sort direction */
    sortDirection?: "asc" | "desc" | undefined;
    /** Additional custom parameters */
    extraParams?: Record<string, string> | undefined;
}
