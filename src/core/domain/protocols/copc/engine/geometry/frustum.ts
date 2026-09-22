/**
 * Frustum culling with plane-mask inheritance optimization.
 * COPC-specific: operates in deck.gl common space via projection helpers.
 */

import { Bbox, type BBox3D, type FrustumPlanes } from "@core/lib/geo";
import type { ProjectToCommonSpace } from "./projection";

/** Immutable camera state for a single traversal/render frame. */
export interface CameraSnapshot {
    frustumPlanes: FrustumPlanes;
    cameraPos: [number, number, number];
    /** Normalized camera look direction in deck common space (x east, y north, z up). Defaults to [0, 0, -1] when degenerate. */
    cameraDirection: [number, number, number];
    fovRadians: number;
    projectToCommonSpace: ProjectToCommonSpace;
    screenHeightPx: number;
    pixelRatio: number;
}

/**
 * Project a node's WGS84 AABB into deck.gl common space.
 *
 * The result is absolute, not relative to the viewport centre, because that is
 * the space the frustum planes are stated in — deck.gl derives them from
 * `viewProjectionMatrix`, which carries the centring itself.
 *
 * All eight corners are projected rather than the two extreme ones: `alt` may
 * reach the projector, and a projector is free to be nonlinear in any axis.
 */
export function projectNodeBoundsToCommonSpace(
    boundsWgs84: BBox3D,
    projectToCommonSpace: ProjectToCommonSpace,
): BBox3D {
    const corners: [number, number, number][] = [];
    for (const cx of [boundsWgs84.minX, boundsWgs84.maxX]) {
        for (const cy of [boundsWgs84.minY, boundsWgs84.maxY]) {
            for (const cz of [boundsWgs84.minZ, boundsWgs84.maxZ]) {
                corners.push(projectToCommonSpace(cx, cy, cz));
            }
        }
    }
    return Bbox.fromCorners({
        minX: Math.min(...corners.map((c) => c[0])),
        minY: Math.min(...corners.map((c) => c[1])),
        minZ: Math.min(...corners.map((c) => c[2])),
        maxX: Math.max(...corners.map((c) => c[0])),
        maxY: Math.max(...corners.map((c) => c[1])),
        maxZ: Math.max(...corners.map((c) => c[2])),
    });
}

/**
 * Test whether a 3D AABB intersects the camera frustum's four side planes.
 *
 * A point is outside a plane when `normal · point > distance`, with `distance`
 * read as the signed constant deck.gl supplies — negative for left and bottom.
 * The sign is part of where the plane sits, so it must not be stripped: both
 * the sign and the space are fixed by deck.gl's `viewProjectionMatrix`, and
 * this test only reproduces the clip-space decision that matrix already
 * encodes. `bboxCommon` must therefore be absolute common space, the space the
 * matrix expects; feeding it coordinates relative to the viewport centre moves
 * every node by the centre's offset and the two conventions disagree.
 *
 * Only the corner minimizing `normal · point` is tested: the box lies wholly
 * outside only if even its least-outward corner does.
 *
 * EPS is float tolerance on a dot product of numbers around 256, nothing more.
 * It leans towards keeping a box, since one wrongly kept costs a frame of
 * overdraw while one wrongly dropped pops visibly.
 *
 * @param bboxCommon - Node AABB in absolute deck.gl common space.
 * @param planes - Frustum planes from deck.gl Viewport.getFrustumPlanes().
 */
export function isAabbInFrustumPlanes(
    bboxCommon: BBox3D,
    planes: FrustumPlanes,
): boolean {
    const EPS = 1e-9;
    const sidePlanes = [planes.left, planes.right, planes.top, planes.bottom];

    for (const plane of sidePlanes) {
        const [nx, ny, nz] = plane.normal;
        const nvx = nx < 0 ? bboxCommon.maxX : bboxCommon.minX;
        const nvy = ny < 0 ? bboxCommon.maxY : bboxCommon.minY;
        const nvz = nz < 0 ? bboxCommon.maxZ : bboxCommon.minZ;

        if (nx * nvx + ny * nvy + nz * nvz - plane.distance > EPS) {
            return false;
        }
    }
    return true;
}
