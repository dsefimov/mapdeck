/** Octree cell geometry: bounds of the cell a key addresses inside the root cube. */

import { Bbox, type BBox3D } from "@core/lib/geo";
import type { NodeKey } from "../../types";

/** Root cube of the octree in the source CRS: [minX, minY, minZ, maxX, maxY, maxZ]. */
export type OctreeCube = [number, number, number, number, number, number];

/**
 * Bounds (in the source CRS) of the octree cell `key` addresses inside `cube`.
 * Cell edge at depth D is cubeEdge / 2^D; the cell's min corner sits at
 * cubeMin + xyz * cellEdge.
 */
export function octreeCellBounds(cube: OctreeCube, key: NodeKey): BBox3D {
    const scale = 1 / Math.pow(2, key[0]);
    const size: [number, number, number] = [
        (cube[3] - cube[0]) * scale,
        (cube[4] - cube[1]) * scale,
        (cube[5] - cube[2]) * scale,
    ];
    return Bbox.fromCorners({
        minX: cube[0] + key[1] * size[0],
        minY: cube[1] + key[2] * size[1],
        minZ: cube[2] + key[3] * size[2],
        maxX: cube[0] + (key[1] + 1) * size[0],
        maxY: cube[1] + (key[2] + 1) * size[1],
        maxZ: cube[2] + (key[3] + 1) * size[2],
    });
}
