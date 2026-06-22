/**
 * Frustum culling with plane-mask inheritance optimization.
 */

import type { BBox3D } from "@core/framework/types";
import type { ProjectToCommonSpace, CenterOffset } from "./projection";

/** A single plane: normal (unit vector) + signed distance from origin. */
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

/** Immutable camera state for a single traversal/render frame. */
export interface CameraSnapshot {
    frustumPlanes: FrustumPlanes;
    cameraPos: [number, number, number];
    /** Normalized camera look direction in WGS84 space. Defaults to [0, 0, -1] when unavailable. */
    cameraDirection: [number, number, number];
    fovRadians: number;
    projectToCommonSpace: ProjectToCommonSpace;
    centerOffset: CenterOffset;
    screenHeightPx: number;
    pixelRatio: number;
    /** Precomputed common-space Z of camera position for frustum alignment. */
    camCommonZ: number;
}

/**
 * Re-exported types from projection.ts for convenience.
 */
export type { ProjectToCommonSpace, CenterOffset };

/**
 * Project a node's WGS84 AABB into the frustum-test coordinate space.
 * Projects all 8 corners via projectToCommonSpace, offsets by centerOffset,
 * and subtracts camCommonZ to align with the frustum plane coordinate system.
 */
export function projectNodeBoundsToCommonSpace(
    boundsWgs84: BBox3D,
    projectToCommonSpace: ProjectToCommonSpace,
    centerOffset: CenterOffset,
    camCommonZ: number,
): BBox3D {
    const corners: [number, number, number][] = [];
    for (const cx of [boundsWgs84.minX, boundsWgs84.maxX]) {
        for (const cy of [boundsWgs84.minY, boundsWgs84.maxY]) {
            for (const cz of [boundsWgs84.minZ, boundsWgs84.maxZ]) {
                const c = projectToCommonSpace(cx, cy, cz);
                corners.push([
                    c[0] - centerOffset[0],
                    c[1] - centerOffset[1],
                    c[2] - camCommonZ,
                ]);
            }
        }
    }
    return {
        minX: Math.min(...corners.map((c) => c[0])),
        minY: Math.min(...corners.map((c) => c[1])),
        minZ: Math.min(...corners.map((c) => c[2])),
        maxX: Math.max(...corners.map((c) => c[0])),
        maxY: Math.max(...corners.map((c) => c[1])),
        maxZ: Math.max(...corners.map((c) => c[2])),
    };
}

/**
 * Test if a 3D AABB intersects the camera frustum defined by 6 side planes.
 * Uses the p-vertex trick: for each plane, the farthest corner along the
 * normal is tested. If even that corner is behind the plane, the AABB is
 * entirely outside the frustum.
 *
 * @param bboxMercator - Node AABB in Web Mercator meters (Z unchanged).
 * @param planes - Frustum planes from deck.gl Viewport.getFrustumPlanes().
 */
export function isAabbInFrustumPlanes(
    bboxMercator: BBox3D,
    planes: FrustumPlanes,
): boolean {
    const EPS = 0.1;
    const fixDist = (d: number): number => (d > 0 ? -d : d);
    const planesList: FrustumPlane[] = [
        { ...planes.left, distance: fixDist(planes.left.distance) },
        { ...planes.right, distance: fixDist(planes.right.distance) },
        { ...planes.top, distance: fixDist(planes.top.distance) },
        { ...planes.bottom, distance: fixDist(planes.bottom.distance) },
    ];

    for (const plane of planesList) {
        const [nx, ny, nz] = plane.normal;
        const nvx = nx < 0 ? bboxMercator.maxX : bboxMercator.minX;
        const nvy = ny < 0 ? bboxMercator.maxY : bboxMercator.minY;
        const nvz = nz < 0 ? bboxMercator.maxZ : bboxMercator.minZ;

        const dist = nx * nvx + ny * nvy + nz * nvz + plane.distance;
        if (dist > EPS) {
            return false;
        }
    }
    return true;
}
