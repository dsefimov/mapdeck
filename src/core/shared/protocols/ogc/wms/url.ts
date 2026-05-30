/**
 * Pure WMS URL utility functions.
 * No side effects — only URL parsing and construction.
 */

import type { ParsedWmsUrl, WmsOptions } from "@core/framework/types/ogc/wms";

/**
 * Parse a WMS URL into its components.
 * Extracts the clean base URL, LAYERS, and STYLES parameters.
 */
export function parseWmsUrl(url: string): ParsedWmsUrl {
    try {
        const parsed = new URL(url);
        const layers = parsed.searchParams.get("LAYERS") ?? "";
        const styles = parsed.searchParams.get("STYLES") ?? "";
        parsed.search = "";
        return { baseUrl: parsed.toString(), layers, styles };
    } catch {
        return { baseUrl: url, layers: "", styles: "" };
    }
}

/**
 * Resolve WMS layer name with fallback chain:
 * 1. LAYERS param extracted from full GetMap URL (static STAC catalogs)
 * 2. configLayers — set from wms:layers asset field (WMS Extension) or explicit config
 * 3. ""  — empty string fallback
 */
export function getWmsLayerName(url: string, configLayers?: string): string {
    const { layers } = parseWmsUrl(url);
    if (layers) return layers;
    return configLayers ?? "";
}

/**
 * Build a WMS GetMap tile URL for a group of layers.
 */
export function buildWmsTileUrl(
    baseUrl: string,
    layers: string,
    options: WmsOptions = {},
): string {
    const base = parseWmsUrl(baseUrl).baseUrl;
    const version = options.version ?? "1.3.0";
    const format = options.format ?? "image/png";
    const styles = options.styles ?? "";
    const q = [
        `SERVICE=WMS`,
        `VERSION=${version}`,
        `REQUEST=GetMap`,
        `LAYERS=${encodeURIComponent(layers)}`,
        `STYLES=${encodeURIComponent(styles)}`,
        `FORMAT=${encodeURIComponent(format)}`,
        `TRANSPARENT=TRUE`,
        `SRS=EPSG:3857`,
        `CRS=EPSG:3857`,
        `BBOX={bbox-epsg-3857}`,
        `WIDTH=256`,
        `HEIGHT=256`,
    ];
    return `${base}?${q.join("&")}`;
}

/**
 * Build a WMS GetFeatureInfo URL for a group of layers.
 */
export function buildWmsFeatureInfoUrl(
    baseUrl: string,
    layers: string,
    options: WmsOptions = {},
): string {
    const base = parseWmsUrl(baseUrl).baseUrl;
    const version = options.version ?? "1.3.0";
    const format = options.format ?? "application/json";
    const q = [
        `SERVICE=WMS`,
        `VERSION=${version}`,
        `REQUEST=GetFeatureInfo`,
        `LAYERS=${encodeURIComponent(layers)}`,
        `STYLES=`,
        `FORMAT=image/png`,
        `TRANSPARENT=TRUE`,
        `QUERY_LAYERS=${encodeURIComponent(layers)}`,
        `INFO_FORMAT=${encodeURIComponent(format)}`,
        `FEATURE_COUNT=50`,
    ];
    return `${base}?${q.join("&")}`;
}
