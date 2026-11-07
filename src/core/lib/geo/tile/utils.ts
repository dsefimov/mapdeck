/**
 * Web Mercator tile coordinate utilities.
 * Pure math — no external dependencies.
 *
 * Conventions:
 * - Tile coordinates: [x, y, zoom] where x,y are integers in [0, 2^zoom)
 * - Bounding box: [west, south, east, north] in WGS84 degrees
 * - Quadkey: string identifier for a tile at a given zoom
 */

import type { Bbox2DTuple } from "../types";

/** Tile coordinate: x and y in [0, 2^zoom). */
export type TileCoord = readonly [x: number, y: number, zoom: number];

/** Latitude at which the Web Mercator square closes onto the poles. */
const MAX_MERCATOR_LATITUDE = 85.0511287798066;

/**
 * Convert longitude to tile x at given zoom.
 */
function lonToX(lon: number, zoom: number): number {
    return ((lon + 180) / 360) * Math.pow(2, zoom);
}

/**
 * Convert latitude to tile y at given zoom.
 */
function latToY(lat: number, zoom: number): number {
    const clamped = Math.min(
        Math.max(lat, -MAX_MERCATOR_LATITUDE),
        MAX_MERCATOR_LATITUDE,
    );
    const sin = Math.sin((clamped * Math.PI) / 180);
    return (
        (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) *
        Math.pow(2, zoom)
    );
}

/**
 * Convert tile x to longitude.
 */
function xToLon(x: number, zoom: number): number {
    return (x / Math.pow(2, zoom)) * 360 - 180;
}

/**
 * Convert tile y to latitude.
 */
function yToLat(y: number, zoom: number): number {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Convert a tile to its bounding box.
 */
export function tileToBbox(tile: TileCoord): Bbox2DTuple {
    const [x, y, zoom] = tile;
    const west = xToLon(x, zoom);
    const east = xToLon(x + 1, zoom);
    const north = yToLat(y, zoom);
    const south = yToLat(y + 1, zoom);
    return [west, south, east, north];
}

/**
 * Generate a quadkey string for a tile — the Bing tile system
 * interleaving: each base-4 digit is 2·(y bit) + (x bit), most
 * significant bits first. Correct for zoom up to 31 — x and y are
 * shifted with 32-bit operations.
 */
export function tileToQuadkey(tile: TileCoord): string {
    const zoom = tile[2];
    let x = tile[0];
    let y = tile[1];
    let key = "";
    for (let z = zoom; z > 0; z--) {
        const digit = ((y & 1) << 1) | (x & 1);
        key = digit.toString() + key;
        x >>= 1;
        y >>= 1;
    }
    return key;
}

/** Runaway guard: a whole-world query at a high zoom would hang the tab. */
const DEFAULT_MAX_TILES = 10_000;

/**
 * All tiles at `zoom` overlapping `bbox`. A box edge that coincides
 * with a tile boundary does not count as overlapping the tile beyond
 * it; a degenerate axis (a point or a zero-width/height line)
 * collapses to its floor-side tile. A box with west > east (an
 * antimeridian crossing, RFC 7946) yields no tiles; split it into two
 * boxes. Throws when the tile count would exceed `maxTiles`.
 */
export function getTilesForBounds(
    bbox: Bbox2DTuple,
    zoom: number,
    maxTiles: number = DEFAULT_MAX_TILES,
): TileCoord[] {
    const [west, south, east, north] = bbox;
    const maxIndex = 2 ** zoom - 1;

    const minX = Math.max(0, Math.floor(lonToX(west, zoom)));
    const minY = Math.max(0, Math.floor(latToY(north, zoom)));
    const maxX =
        west === east
            ? Math.min(maxIndex, Math.floor(lonToX(east, zoom)))
            : Math.min(maxIndex, Math.ceil(lonToX(east, zoom)) - 1);
    const maxY =
        south === north
            ? Math.min(maxIndex, Math.floor(latToY(south, zoom)))
            : Math.min(maxIndex, Math.ceil(latToY(south, zoom)) - 1);

    if (maxX < minX || maxY < minY) return [];

    const count = (maxX - minX + 1) * (maxY - minY + 1);
    if (count > maxTiles) {
        throw new Error(
            `getTilesForBounds: ${count} tiles at zoom ${zoom} exceed the limit of ${maxTiles}`,
        );
    }

    const tiles: TileCoord[] = [];
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            tiles.push([x, y, zoom]);
        }
    }
    return tiles;
}
