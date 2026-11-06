/**
 * Core geospatial type definitions.
 * Pure contracts — no business logic.
 */

/** The two accepted bbox arities: [w, s, e, n] or [w, s, minZ, e, n, maxZ]. */
export type BboxTuple =
    | readonly [number, number, number, number]
    | readonly [number, number, number, number, number, number];

/**
 * Bounding box with named fields.
 * Construct with a 4-element [w, s, e, n] or 6-element [w, s, minZ, e, n, maxZ] tuple.
 */
export class Bbox {
    readonly west: number;
    readonly south: number;
    readonly east: number;
    readonly north: number;
    readonly minZ: number | undefined;
    readonly maxZ: number | undefined;

    constructor(tuple: BboxTuple) {
        // The type admits only 4 and 6; the guard covers untyped JS callers.
        const arity = (tuple as readonly number[]).length;
        if (arity !== 4 && arity !== 6) {
            throw new Error(
                `Bbox requires a 4-element [w, s, e, n] or 6-element [w, s, minZ, e, n, maxZ] tuple, got ${arity}`,
            );
        }
        if (tuple.length === 6) {
            this.west = tuple[0];
            this.south = tuple[1];
            this.minZ = tuple[2];
            this.east = tuple[3];
            this.north = tuple[4];
            this.maxZ = tuple[5];
        } else {
            this.west = tuple[0];
            this.south = tuple[1];
            this.east = tuple[2];
            this.north = tuple[3];
            this.minZ = undefined;
            this.maxZ = undefined;
        }
    }

    /** Build a 3D bounds from min/max corner values. */
    static fromCorners(c: {
        readonly minX: number;
        readonly minY: number;
        readonly minZ: number;
        readonly maxX: number;
        readonly maxY: number;
        readonly maxZ: number;
    }): BBox3D {
        return new Bbox([
            c.minX,
            c.minY,
            c.minZ,
            c.maxX,
            c.maxY,
            c.maxZ,
        ]) as BBox3D;
    }

    /*
     * The min/max aliases below are COPC-engine vocabulary; the canonical
     * dictionary is west/south/east/north. The aliases retire when the
     * engine block is reworked.
     */

    /** Minimum longitude (west). */
    get minX(): number {
        return this.west;
    }

    /** Minimum latitude (south). */
    get minY(): number {
        return this.south;
    }

    /** Maximum longitude (east). */
    get maxX(): number {
        return this.east;
    }

    /** Maximum latitude (north). */
    get maxY(): number {
        return this.north;
    }

    /** True (and narrows to BBox3D) when this bbox carries elevation. */
    hasElevation(): this is BBox3D {
        return this.minZ !== undefined && this.maxZ !== undefined;
    }

    /** Center point as [longitude, latitude, z]. Z is 0 for 2D bbox. */
    get center(): [number, number, number] {
        const z = this.hasElevation()
            ? (this.minZ + this.maxZ) / 2
            : 0;
        return [(this.west + this.east) / 2, (this.south + this.north) / 2, z];
    }

    /** 2D bounds as [[west, south], [east, north]] for map libraries. */
    get bounds(): [[number, number], [number, number]] {
        return [
            [this.west, this.south],
            [this.east, this.north],
        ];
    }

    /** 6-element tuple [west, south, minZ, east, north, maxZ] or null if 2D. */
    get bounds3D(): [number, number, number, number, number, number] | null {
        if (!this.hasElevation()) return null;
        return [
            this.west,
            this.south,
            this.minZ,
            this.east,
            this.north,
            this.maxZ,
        ];
    }
}

/** 2D point: [longitude, latitude] */
export type Point2D = [number, number];

/** Geographic bounding box: [west, south, east, north] in degrees. */
export type Bbox2DTuple = readonly [
    west: number,
    south: number,
    east: number,
    north: number,
];

/** Point on the map in WGS84 degrees. */
export interface GeoPoint {
    lng: number;
    lat: number;
    z: number;
}

/**
 * 3D bounds — a Bbox guaranteed to carry elevation.
 * Same structure as Bbox; the intersection only narrows minZ/maxZ to numbers.
 */
export type BBox3D = Bbox & { minZ: number; maxZ: number };
