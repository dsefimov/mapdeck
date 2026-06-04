/**
 * Bounding Box (bbox) utility functions
 *
 * Types are imported from @core/framework/types/geo — this file contains only logic.
 */

import type { GeoJSONGeometry } from "@core/framework/types/geo";
import { Bbox } from "@core/framework/types/geo";

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
        const minZ = Math.min(a.minZ ?? -Infinity, b.minZ ?? -Infinity);
        const maxZ = Math.max(a.maxZ ?? Infinity, b.maxZ ?? Infinity);
        return new Bbox([minX, minY, maxX, maxY, minZ, maxZ]);
    }

    return new Bbox([minX, minY, maxX, maxY]);
}

export function bboxesIntersect(
    bbox1: Bbox,
    bbox2: Bbox,
    ignoreZ = true,
): boolean {
    const overlap2D = !(
        bbox1.west > bbox2.east ||
        bbox2.west > bbox1.east ||
        bbox1.south > bbox2.north ||
        bbox2.south > bbox1.north
    );

    if (!overlap2D) return false;
    if (ignoreZ) return true;

    if (bbox1.is3D && bbox2.is3D) {
        return !(bbox1.minZ! > bbox2.maxZ! || bbox2.minZ! > bbox1.maxZ!);
    }
    return true;
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
