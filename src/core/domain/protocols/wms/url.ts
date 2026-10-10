/**
 * Pure WMS URL builders — request construction only, no parsing.
 * The base URL arrives clean by contract (the binding's URL is
 * the endpoint without query parameters; the protocol never parses query
 * strings out of it).
 */

import type { WmsOptions } from "./types";
import { WMS_IMAGE_FORMAT } from "./types";
import { RASTER_TILE_SIZE_PX } from "../shared/RasterAdapter";

/** Features one GetFeatureInfo click returns at most — a click inspects a spot, not a table. */
const FEATURE_COUNT_LIMIT = 50;

/**
 * The CRS parameter key for the WMS version: ≤1.1.x speaks SRS, 1.3.0+
 * speaks CRS. One policy for the whole WMS conversation — GetMap and
 * GetFeatureInfo both route through it, no per-request improvisation.
 */
export function wmsCrsKey(version: string): "SRS" | "CRS" {
    return version.startsWith("1.1") || version.startsWith("1.0")
        ? "SRS"
        : "CRS";
}

/**
 * Build a WMS GetMap tile URL for a group of layers.
 */
export function buildWmsTileUrl(
    baseUrl: string,
    layers: string,
    options: WmsOptions = {},
): string {
    const version = options.version ?? "1.3.0";
    const format = options.format ?? WMS_IMAGE_FORMAT;
    const styles = options.styles ?? "";
    const q = [
        `SERVICE=WMS`,
        `VERSION=${version}`,
        `REQUEST=GetMap`,
        `LAYERS=${encodeURIComponent(layers)}`,
        `STYLES=${encodeURIComponent(styles)}`,
        `FORMAT=${encodeURIComponent(format)}`,
        `TRANSPARENT=TRUE`,
        `${wmsCrsKey(version)}=EPSG:3857`,
        `BBOX={bbox-epsg-3857}`,
        `WIDTH=${RASTER_TILE_SIZE_PX}`,
        `HEIGHT=${RASTER_TILE_SIZE_PX}`,
    ];
    return `${baseUrl}?${q.join("&")}`;
}

/**
 * Build a WMS GetFeatureInfo URL for a group of layers.
 */
export function buildWmsFeatureInfoUrl(
    baseUrl: string,
    layers: string,
    options: WmsOptions = {},
): string {
    const version = options.version ?? "1.3.0";
    const format = options.format ?? "application/json";
    const q = [
        `SERVICE=WMS`,
        `VERSION=${version}`,
        `REQUEST=GetFeatureInfo`,
        `LAYERS=${encodeURIComponent(layers)}`,
        `STYLES=`,
        `FORMAT=${WMS_IMAGE_FORMAT}`,
        `TRANSPARENT=TRUE`,
        `QUERY_LAYERS=${encodeURIComponent(layers)}`,
        `INFO_FORMAT=${encodeURIComponent(format)}`,
        `FEATURE_COUNT=${FEATURE_COUNT_LIMIT}`,
    ];
    return `${baseUrl}?${q.join("&")}`;
}
