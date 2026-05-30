/**
 * STAC (SpatioTemporal Asset Catalog) Core Types
 *
 * Base type definitions for the STAC specification version 1.0.0.
 * Extension-specific fields live in separate files under `extensions/`.
 *
 * @see {@link https://github.com/radiantearth/stac-spec} STAC Specification
 */

export type STACVersion = "1.0.0" | string;

export type STACCatalogType = "Catalog";
export type STACCollectionType = "Collection";
export type STACFeatureType = "Feature";
export type STACFeatureCollectionType = "FeatureCollection";
export type STACType =
    | STACCatalogType
    | STACCollectionType
    | STACFeatureType
    | STACFeatureCollectionType;

/**
 * STAC Link object
 * @see https://github.com/radiantearth/stac-spec/blob/master/collection-spec/collection-spec.md#link-object
 */
export interface STACLink {
    readonly rel:
        | "self"
        | "root"
        | "parent"
        | "child"
        | "item"
        | "collection"
        | string;
    readonly href: string;
    readonly type?: string;
    readonly title?: string;
}

/**
 * STAC Asset object
 * @see https://github.com/radiantearth/stac-spec/blob/master/item-spec/item-spec.md#asset-object
 */
export interface STACAsset {
    readonly href: string;
    readonly title?: string;
    readonly description?: string;
    readonly type?: string;
    readonly roles?: readonly string[];
    // WMS Extension fields (unofficial but widespread)
    readonly "wms:layers"?: string;
    readonly "wms:styles"?: string;
    readonly "wms:dimensions"?: Record<string, string>;
    // Extension fields via index signature
    readonly [key: string]: unknown;
}

export interface STACSpatialExtent {
    readonly bbox: readonly (readonly number[])[];
}

export interface STACTemporalExtent {
    readonly interval: readonly (readonly string[])[];
}

export interface STACExtent {
    readonly spatial: STACSpatialExtent;
    readonly temporal?: STACTemporalExtent;
}

/**
 * STAC Catalog
 * @see https://github.com/radiantearth/stac-spec/blob/master/catalog-spec/catalog-spec.md
 */
export interface STACCatalog {
    readonly id: string;
    readonly type: STACCatalogType;
    readonly stac_version: STACVersion;
    readonly title?: string;
    readonly description?: string;
    readonly links: readonly STACLink[];
}

/**
 * STAC Collection
 * @see https://github.com/radiantearth/stac-spec/blob/master/collection-spec/collection-spec.md
 */
export interface STACCollection {
    readonly id: string;
    readonly type: STACCollectionType;
    readonly stac_version: STACVersion;
    readonly stac_extensions?: readonly string[];
    readonly title?: string;
    readonly description: string;
    readonly extent: STACExtent;
    readonly links: readonly STACLink[];
    readonly assets?: Readonly<Record<string, STACAsset>>;
}

export interface STACItemProperties {
    readonly title?: string;
    readonly description?: string;
    readonly [key: string]: unknown;
}

/**
 * STAC Item
 * @see https://github.com/radiantearth/stac-spec/blob/master/item-spec/item-spec.md
 */
export interface STACItem {
    readonly stac_version: STACVersion;
    readonly stac_extensions?: readonly string[];
    readonly type: STACFeatureType;
    readonly id: string;
    readonly bbox: readonly number[];
    readonly geometry?: unknown;
    readonly properties: STACItemProperties;
    readonly assets: Readonly<Record<string, STACAsset>>;
    readonly links?: readonly STACLink[];
}

/**
 * STAC FeatureCollection
 * @see https://github.com/radiantearth/stac-spec/blob/master/item-spec/item-spec.md#featurecollection-files
 */
export interface STACFeatureCollection {
    readonly type: STACFeatureCollectionType;
    readonly stac_version?: STACVersion;
    readonly features: STACItem[];
    readonly links?: readonly STACLink[];
}

/**
 * STAC Collections response (from /collections API endpoint)
 * @see https://github.com/radiantearth/stac-api-spec/blob/main/STAC-extensions/Collections.md
 */
export interface STACCollectionsResponse {
    readonly collections: readonly STACCollection[];
    readonly links?: readonly STACLink[];
}

export type STACEntity =
    | STACCatalog
    | STACCollection
    | STACItem
    | STACFeatureCollection;

export function isSTACCatalog(entity: STACEntity): entity is STACCatalog {
    return entity.type === "Catalog";
}

export function isSTACCollection(entity: STACEntity): entity is STACCollection {
    return entity.type === "Collection";
}

export function isSTACItem(entity: STACEntity): entity is STACItem {
    return entity.type === "Feature";
}

export function isSTACFeatureCollection(
    entity: STACEntity,
): entity is STACFeatureCollection {
    return entity.type === "FeatureCollection";
}

export function assetHasRole(asset: STACAsset, role: string): boolean {
    return asset.roles?.includes(role) ?? false;
}

export function getAssetsByRole(
    assets: Readonly<Record<string, STACAsset>>,
    role: string,
): STACAsset[] {
    return Object.values(assets).filter((asset) => assetHasRole(asset, role));
}

export const TileRoles = {
    RASTER_TILE: "raster-tile",
    VECTOR_TILE: "vector-tile",
    POINT_CLOUD: "point-cloud",
} as const;

export const ReportRoles = {
    REPORT: "report",
    METADATA: "metadata",
} as const;
