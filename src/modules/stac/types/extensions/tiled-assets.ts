/**
 * STAC Tiled Assets Extension types
 * @see https://github.com/stac-extensions/tiled-assets
 */

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
