/**
 * Bounding Box (bbox) utility functions
 *
 * Types come from ./types directly — importing from the barrel would close
 * a module cycle (index → bbox → index).
 */

import type { BboxTuple, GeoJSONGeometry } from "./types";
import { Bbox } from "./types";

export function bboxFromGeometry(
    geometry: GeoJSONGeometry | null | undefined,
): Bbox | null {
    if (!geometry || typeof geometry !== "object") return null;
    if (typeof geometry.type !== "string") return null;

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
    return parseCoords2D(coords);
}

/**
 * Narrows a raw bbox tuple of unknown arity (external JSON) to a Bbox;
 * null for absent input, wrong arity, or non-finite coordinates.
 */
export function bboxFromTuple(
    tuple: readonly number[] | undefined | null,
): Bbox | null {
    const arityOk =
        tuple !== null &&
        tuple !== undefined &&
        (tuple.length === 4 || tuple.length === 6) &&
        tuple.every((v) => Number.isFinite(v));
    // Arity and elements are validated above; the cast only restores
    // tuple-ness for the constructor.
    return arityOk ? new Bbox(tuple as BboxTuple) : null;
}

function parseCoords2D(coords: unknown[]): Bbox | null {
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    let found = false;

    const update = (x: number, y: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        found = true;
    };

    traverse(coords, update);
    return found ? new Bbox([minX, minY, maxX, maxY]) : null;
}

function traverse(
    arr: unknown[],
    update: (x: number, y: number) => void,
): void {
    for (const item of arr) {
        if (!Array.isArray(item)) continue;
        if (typeof item[0] === "number" && typeof item[1] === "number") {
            update(item[0], item[1]);
        } else {
            traverse(item, update);
        }
    }
}

export function flattenTo2D(bbox: Bbox): Bbox {
    return new Bbox([bbox.west, bbox.south, bbox.east, bbox.north]);
}

export function unionBbox(a: Bbox | null, b: Bbox | null): Bbox | null {
    if (!a) return b;
    if (!b) return a;

    const minX = Math.min(a.west, b.west);
    const minY = Math.min(a.south, b.south);
    const maxX = Math.max(a.east, b.east);
    const maxY = Math.max(a.north, b.north);

    if (a.is3D || b.is3D) {
        // A missing vertical side is neutral: it must not drag the union
        // to an infinity. Tuple order is [w, s, minZ, e, n, maxZ].
        const minZ = Math.min(a.minZ ?? Infinity, b.minZ ?? Infinity);
        const maxZ = Math.max(a.maxZ ?? -Infinity, b.maxZ ?? -Infinity);
        return new Bbox([minX, minY, minZ, maxX, maxY, maxZ]);
    }

    return new Bbox([minX, minY, maxX, maxY]);
}

export function validateBbox(bbox: Bbox): { isValid: boolean; error?: string } {
    if (bbox.west > bbox.east || bbox.south > bbox.north)
        return {
            isValid: false,
            error: "Invalid bounds: W<E and S<N required",
        };
    if (bbox.is3D && bbox.minZ! > bbox.maxZ!)
        return {
            isValid: false,
            error: "Invalid Z bounds: minZ < maxZ required",
        };
    return { isValid: true };
}
