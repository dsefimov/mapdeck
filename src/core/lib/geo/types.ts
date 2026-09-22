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
    }): Bbox & { minZ: number; maxZ: number } {
        return new Bbox([
            c.minX,
            c.minY,
            c.minZ,
            c.maxX,
            c.maxY,
            c.maxZ,
        ]) as Bbox & { minZ: number; maxZ: number };
    }

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

    /** True if this bbox has Z dimension. */
    get is3D(): boolean {
        return this.minZ !== undefined && this.maxZ !== undefined;
    }

    /** Center point as [longitude, latitude, z]. Z is 0 for 2D bbox. */
    get center(): [number, number, number] {
        const z = this.is3D ? (this.minZ! + this.maxZ!) / 2 : 0;
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
        if (!this.is3D) return null;
        return [
            this.west,
            this.south,
            this.minZ!,
            this.east,
            this.north,
            this.maxZ!,
        ];
    }
}

/** 2D point: [longitude, latitude] */
export type Point2D = [number, number];

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

/** GeoJSON geometry object (minimal representation) */
export interface GeoJSONGeometry {
    type: string;
    coordinates?: unknown[];
    geometries?: GeoJSONGeometry[];
}

/**
 * A single plane: unit normal plus the signed plane constant.
 *
 * Follows deck.gl's `getFrustumPlanes`, whose normal points out of the frustum
 * and whose `distance` is signed — negative for the left and bottom planes.
 * An outside test reads `normal · point > distance`, in the same absolute
 * common space as the `viewProjectionMatrix` the planes are derived from.
 */
export interface FrustumPlane {
    distance: number;
    normal: [number, number, number];
}

/** Six frustum planes in deck.gl world coordinates (Web Mercator meters). */
export interface FrustumPlanes {
    near: FrustumPlane;
    far: FrustumPlane;
    left: FrustumPlane;
    right: FrustumPlane;
    top: FrustumPlane;
    bottom: FrustumPlane;
}
