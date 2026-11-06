/**
 * Bounding Box (bbox) utility functions
 *
 * Types come from ./types directly — importing from the barrel would close
 * a module cycle (index → bbox → index).
 */

import type { BboxTuple } from "./types";
import { Bbox } from "./types";

/** The parts of a GeoJSON geometry this module reads — unvalidated. */
interface GeometryLike {
    type: unknown;
    coordinates?: unknown;
    geometries?: unknown;
}

function isGeometryLike(value: unknown): value is GeometryLike {
    return typeof value === "object" && value !== null && "type" in value;
}

/**
 * Bbox of a GeoJSON geometry from untrusted JSON — validated here at
 * runtime, so the parameter is honestly `unknown`.
 */
export function bboxFromGeometry(geometry: unknown): Bbox | null {
    if (!isGeometryLike(geometry) || typeof geometry.type !== "string")
        return null;

    if (geometry.type === "GeometryCollection") {
        if (
            !Array.isArray(geometry.geometries) ||
            geometry.geometries.length === 0
        )
            return null;
        let union: Bbox | null = null;
        for (const geom of geometry.geometries) {
            union = unionBbox(union, bboxFromGeometry(geom));
        }
        return union;
    }

    if (!Array.isArray(geometry.coordinates)) return null;
    const coords: unknown[] =
        geometry.type === "Point"
            ? [geometry.coordinates]
            : geometry.coordinates;
    return bboxOfPositions(coords);
}

/**
 * Narrows a raw bbox tuple of unknown arity (external JSON) to a Bbox;
 * null for absent input, wrong arity, or non-finite coordinates.
 */
export function bboxFromTuple(
    tuple: readonly number[] | undefined | null,
): Bbox | null {
    if (!tuple || (tuple.length !== 4 && tuple.length !== 6)) return null;
    if (!tuple.every((v) => Number.isFinite(v))) return null;
    // Arity and elements are validated above; the cast only restores
    // tuple-ness for the constructor.
    return new Bbox(tuple as BboxTuple);
}

/** Yields every [x, y] position at any nesting depth of `node`. */
function* positionsOf(node: unknown): Generator<[number, number]> {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
        yield [node[0], node[1]];
        return;
    }
    for (const child of node) {
        yield* positionsOf(child);
    }
}

function bboxOfPositions(coords: unknown[]): Bbox | null {
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    let found = false;

    for (const [x, y] of positionsOf(coords)) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        found = true;
    }
    return found ? new Bbox([minX, minY, maxX, maxY]) : null;
}

export function flattenTo2D(bbox: Bbox): Bbox {
    // Bbox is immutable — an already-2D box can be returned as-is.
    return bbox.hasElevation()
        ? new Bbox([bbox.west, bbox.south, bbox.east, bbox.north])
        : bbox;
}

export function unionBbox(a: Bbox | null, b: Bbox | null): Bbox | null {
    if (!a) return b;
    if (!b) return a;

    const minX = Math.min(a.west, b.west);
    const minY = Math.min(a.south, b.south);
    const maxX = Math.max(a.east, b.east);
    const maxY = Math.max(a.north, b.north);

    if (a.hasElevation() || b.hasElevation()) {
        // A missing vertical side is neutral: it must not drag the union
        // to an infinity. Tuple order is [w, s, minZ, e, n, maxZ].
        const minZ = Math.min(a.minZ ?? Infinity, b.minZ ?? Infinity);
        const maxZ = Math.max(a.maxZ ?? -Infinity, b.maxZ ?? -Infinity);
        return new Bbox([minX, minY, minZ, maxX, maxY, maxZ]);
    }

    return new Bbox([minX, minY, maxX, maxY]);
}

/** Why a {@link Bbox} cannot be used as map bounds. */
export type BboxProblem =
    | "inverted-horizontal"
    | "inverted-vertical"
    | "inverted-elevation";

/**
 * The first reason `bbox` is unusable as bounds, or undefined when it is
 * usable. Equal edges are allowed — a degenerate box is a point or a
 * line. Boxes crossing the antimeridian (west > east, RFC 7946) are
 * rejected: split them into two before validating.
 */
export function findBboxProblem(bbox: Bbox): BboxProblem | undefined {
    if (bbox.west > bbox.east) return "inverted-horizontal";
    if (bbox.south > bbox.north) return "inverted-vertical";
    if (bbox.hasElevation() && bbox.minZ > bbox.maxZ)
        return "inverted-elevation";
    return undefined;
}
