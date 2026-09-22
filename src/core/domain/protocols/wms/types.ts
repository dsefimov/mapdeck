/**
 * WMS-specific types for layer grouping and configuration.
 * Pure contracts — no business logic.
 */

/**
 * Common WMS request parameters.
 * All fields are optional — used to override defaults when building URLs.
 */
/** Raster format every WMS request/layer is pinned to. */
export const WMS_IMAGE_FORMAT = "image/png";

/** Common WMS request parameters — used to override defaults when building URLs. */
export interface WmsOptions {
    /** WMS version (default: 1.3.0) */
    version?: string | undefined;
    /** Image format (default: image/png) */
    format?: string | undefined;
    /** Comma-separated style names */
    styles?: string | undefined;
    /** Layer opacity (0.0 to 1.0) */
    opacity?: number | undefined;
}

/**
 * Key used to determine if two WMS layers can be grouped together.
 * Layers must match on all fields to share a group.
 */
export interface WmsGroupKey {
    baseUrl: string;
    format: string;
    version: string;
    opacity: number;
}

/**
 * Configuration for a single WMS group — the output of WmsGrouper.
 */
export interface WmsGroupConfig {
    groupId: string;
    nodeIds: string[];
    baseUrl: string;
    format: string;
    version: string;
    opacity: number;
}
