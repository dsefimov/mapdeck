/**
 * STAC (SpatioTemporal Asset Catalog) API Types
 *
 * Type definitions for the STAC (SpatioTemporal Asset Catalog) specification
 * version 1.0.0, adapted to project requirements.
 *
 * This module provides TypeScript interfaces and types for:
 * - STAC Catalog: Root catalog containing links to collections
 * - STAC Collection: Group of items with metadata and assets
 * - STAC Item: Individual geospatial features with assets
 * - Core components: Links, Assets, Extents, Properties
 *
 * All types are designed to be compatible with the STAC specification
 * while supporting additional project-specific requirements such as
 * report assets, tile roles (raster-tile, vector-tile).
 *
 * @see {@link https://github.com/radiantearth/stac-spec} STAC Specification
 * @module STACTypes
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
    readonly title?: string;
    readonly description: string;
    readonly extent: STACExtent;
    readonly links: readonly STACLink[];
    readonly assets?: { readonly [key: string]: STACAsset };
}

export interface STACItemProperties {
    readonly title: string;
    readonly description: string;
    readonly [key: string]: unknown;
}

/**
 * STAC Item
 * @see https://github.com/radiantearth/stac-spec/blob/master/item-spec/item-spec.md
 */
export interface STACItem {
    readonly stac_version: STACVersion;
    readonly type: STACFeatureType;
    readonly id: string;
    readonly bbox: readonly number[];
    readonly geometry?: unknown;
    readonly properties: STACItemProperties;
    readonly assets: { readonly [key: string]: STACAsset };
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
    assets: { readonly [key: string]: STACAsset },
    role: string,
): STACAsset[] {
    return Object.values(assets).filter((asset) => assetHasRole(asset, role));
}

export const TileRoles = {
    RASTER_TILE: "raster-tile",
    VECTOR_TILE: "vector-tile",
    POINT_CLOUD: "point-cloud",
    VECTOR3D: "vector3d",
} as const;

export const ReportRoles = {
    REPORT: "report",
    METADATA: "metadata",
} as const;
