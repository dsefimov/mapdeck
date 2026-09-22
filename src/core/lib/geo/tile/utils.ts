/**
 * Web Mercator tile coordinate utilities.
 * Pure math — no external dependencies.
 *
 * Conventions:
 * - Tile coordinates: [x, y, zoom] where x,y are integers in [0, 2^zoom)
 * - Bounding box: [west, south, east, north] in WGS84 degrees
 * - Quadkey: string identifier for a tile at a given zoom
 */

const PI = Math.PI;
const TWO_PI = PI * 2;
const RAD_TO_DEG = 180 / PI;
const DEG_TO_RAD = PI / 180;

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
    const clamped = Math.min(Math.max(lat, -85.05), 85.05);
    const sin = Math.sin(clamped * DEG_TO_RAD);
    return (
        (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * PI)) * Math.pow(2, zoom)
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
    const n = PI - (TWO_PI * y) / Math.pow(2, zoom);
    return RAD_TO_DEG * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Convert a tile to its bounding box.
 * Returns [west, south, east, north] in WGS84 degrees.
 */
export function tileToBBOX(
    tile: [number, number, number],
): [number, number, number, number] {
    const [x, y, zoom] = tile;
    const west = xToLon(x, zoom);
    const east = xToLon(x + 1, zoom);
    const north = yToLat(y, zoom);
    const south = yToLat(y + 1, zoom);
    return [west, south, east, north];
}

/**
 * Generate a quadkey string for a tile.
 * A quadkey uniquely identifies a tile across zoom levels.
 */
export function tileToQuadkey(tile: [number, number, number]): string {
    let [x, y, zoom] = tile;
    let key = "";
    for (let z = zoom; z > 0; z--) {
        const digit = ((x & 1) << 1) | (y & 1);
        key = digit.toString() + key;
        x >>= 1;
        y >>= 1;
    }
    return key;
}

/**
 * Get all tiles at `zoom` that overlap with the given bounding box.
 * Returns array of [x, y, zoom] tiles.
 */
export function getTilesForBounds(
    bbox: [number, number, number, number],
    zoom: number,
): Array<[number, number, number]> {
    const [west, south, east, north] = bbox;
    const minX = Math.max(0, Math.floor(lonToX(west, zoom)));
    const maxX = Math.min(
        Math.pow(2, zoom) - 1,
        Math.ceil(lonToX(east, zoom)) - 1,
    );
    const minY = Math.max(0, Math.floor(latToY(north, zoom)));
    const maxY = Math.min(
        Math.pow(2, zoom) - 1,
        Math.ceil(latToY(south, zoom)) - 1,
    );

    const tiles: Array<[number, number, number]> = [];
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            tiles.push([x, y, zoom]);
        }
    }
    return tiles;
}
