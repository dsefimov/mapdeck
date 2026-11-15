/**
 * Camera projection shared state: the per-traversal local projection and the
 * per-node screen-space error composed over it. Shared by the octree
 * traversal and the SSE LOD filter — the two hot paths.
 */

import type proj4 from "proj4";

import type { BBox3D } from "@core/lib/geo";
import { buildProjection, computeDistanceToCamera, projectAabbToMeters } from "./projection";
import {
    getScreenSpaceError,
    type SSECameraContext,
} from "./screenSpaceError";
import type { CameraSnapshot } from "./frustum";

/** Local projection plus the camera position in that projection's meters. */
export interface ProjectedCamera {
    projector: proj4.Converter;
    cameraPosMeters: [number, number, number];
}

/**
 * Build the per-traversal aeqd projection centered on the camera and the
 * camera position expressed in that projection's meters (altitude passes
 * through unchanged). Called once per traversal, not per node.
 */
export function projectCameraToMeters(
    cameraPos: [number, number, number],
): ProjectedCamera {
    const projector = buildProjection(cameraPos[0], cameraPos[1]);
    const [camXMeters, camYMeters] = projector.forward([
        cameraPos[0],
        cameraPos[1],
    ]);
    return {
        projector,
        cameraPosMeters: [camXMeters, camYMeters, cameraPos[2]],
    };
}

/** Camera + projection state needed to compute a node's screen-space error. */
export interface NodeSseContext {
    projector: proj4.Converter;
    cameraPosMeters: [number, number, number];
    camera: CameraSnapshot;
    geometricErrorByDepth: (depth: number) => number;
}

/** Map a traversal camera snapshot onto the fields the SSE formula reads. */
export function sseCameraContext(camera: CameraSnapshot): SSECameraContext {
    return {
        fovVerticalRadians: camera.fovRadians,
        screenHeightPx: camera.screenHeightPx,
        pixelRatio: camera.pixelRatio,
    };
}

/**
 * Screen-space error (px) of a node's WGS84 bounds at the given octree depth:
 * project the cell, measure the distance to the camera, apply the SSE formula.
 */
export function computeNodeScreenError(
    boundsWgs84: BBox3D,
    depth: number,
    ctx: NodeSseContext,
): number {
    const bboxMeters = projectAabbToMeters(boundsWgs84, ctx.projector);
    const distanceToCamera = computeDistanceToCamera(
        ctx.cameraPosMeters,
        bboxMeters,
    );
    return getScreenSpaceError(
        ctx.geometricErrorByDepth(depth),
        distanceToCamera,
        sseCameraContext(ctx.camera),
    );
}
