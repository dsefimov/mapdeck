/**
 * STAC Tiled Assets Extension types
 * @see https://github.com/stac-extensions/tiled-assets
 */

export const TILED_ASSETS_SCHEMA =
    "https://stac-extensions.github.io/tiled-assets/v1.0.0/schema.json";

export interface TileMatrixSetLink {
    readonly "tiles:tile_matrix_set": string;
    readonly "tiles:tile_matrix_set_uri"?: string;
}

export interface TileMatrixLink {
    readonly "tiles:tile_matrix_set": string;
    readonly "tiles:tile_matrix_limits"?: TileMatrixLimit[];
}

export interface TileMatrixLimit {
    readonly "tiles:tile_matrix": string;
    readonly "tiles:min_tile_row": number;
    readonly "tiles:max_tile_row": number;
    readonly "tiles:min_tile_col": number;
    readonly "tiles:max_tile_col": number;
}

export interface TiledAssetsItemFields {
    readonly "tiles:tile_matrix_links": TileMatrixLink[];
}

/** Checks whether the item declares the tiled-assets extension */
export function hasTiledAssetsExtension(
    stac_extensions?: readonly string[],
): boolean {
    return stac_extensions?.includes(TILED_ASSETS_SCHEMA) ?? false;
}
