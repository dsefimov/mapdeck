import type { CachedNode } from "../../types";
import type { CameraSnapshot } from "../geometry";
import type { Converter } from "proj4";
import {
    projectNodeBoundsToCommonSpace,
    isAabbInFrustumPlanes,
    projectAabbToMeters,
    computeDistanceToCamera,
} from "../geometry";
import { computeMaxDepthForNode } from "./traverseOctree";

/** Shared context for culling decisions — fields that are constant across all nodes in a traversal. */
export interface CullingContext {
    rbushKeySet: Set<string>;
    camera: CameraSnapshot;
    cameraPosMeters: [number, number, number];
    projector: Converter;
    geometricErrorByDepth: (depth: number) => number;
    maxOctreeDepth: number;
    maxScreenErrorPx: number;
}

/**
 * Returns `true` if the node should be skipped during octree traversal.
 * Checks: RBush XY prefilter → 3D frustum culling → anti-overzoom depth cap.
 */
export function shouldCullNode(
    key: string,
    node: CachedNode,
    depth: number,
    ctx: CullingContext,
): boolean {
    if (!ctx.rbushKeySet.has(key)) return true;

    const bboxCommon = projectNodeBoundsToCommonSpace(
        node.boundsWgs84,
        ctx.camera.projectToCommonSpace,
    );

    if (!isAabbInFrustumPlanes(bboxCommon, ctx.camera.frustumPlanes)) {
        return true;
    }

    const bboxMeters = projectAabbToMeters(node.boundsWgs84, ctx.projector);
    const distanceToCamera = computeDistanceToCamera(
        ctx.cameraPosMeters,
        bboxMeters,
    );

    const depthCap = computeMaxDepthForNode({
        rootSpacing: ctx.geometricErrorByDepth(0),
        distanceToCamera,
        camera: ctx.camera,
        maxOctreeDepth: ctx.maxOctreeDepth,
        maxScreenErrorPx: ctx.maxScreenErrorPx,
    });

    return depth > depthCap;
}
