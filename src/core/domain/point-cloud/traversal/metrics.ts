import type { CameraSnapshot } from "../geometry";
import type { CachedNode } from "@core/framework/types";
import type { Converter } from "proj4";
import {
    projectAabbToMeters,
    computeDistanceToCamera,
    getScreenSpaceError,
} from "../geometry";
import type { PriorityBounds, PriorityState } from "../priority";
import { updatePriority, type PriorityOptions } from "../priority";

const EPSILON7 = 1e-7;

/** Metrics computed for a single node during traversal. */
export interface NodeMetrics {
    screenError: number;
    priority: number;
    distanceToCamera: number;
}

/** Shared context for metrics computation — fields that are constant across all nodes in a traversal. */
export interface MetricsContext {
    projector: Converter;
    cameraPosMeters: [number, number, number];
    camera: CameraSnapshot;
    geometricErrorByDepth: (depth: number) => number;
    bounds: PriorityBounds;
    priorityStateMap: WeakMap<CachedNode, PriorityState>;
    priorityOptions: PriorityOptions;
}

/**
 * Foveated factor: angular deviation between camera look direction and tile center.
 * 0 = tile at center of view, 1 = tile at extreme edge.
 */
export function computeFoveatedFactor(
    tileCenterMeters: [number, number, number],
    cameraPosMeters: [number, number, number],
    cameraDirection: [number, number, number],
): number {
    const dx = tileCenterMeters[0] - cameraPosMeters[0];
    const dy = tileCenterMeters[1] - cameraPosMeters[1];
    const dz = tileCenterMeters[2] - cameraPosMeters[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < EPSILON7) return 0;

    const cosine =
        (dx * cameraDirection[0] +
            dy * cameraDirection[1] +
            dz * cameraDirection[2]) /
        dist;
    return 1 - Math.max(EPSILON7, cosine);
}

/**
 * Compute per-node traversal metrics: screen-space error, priority, distance to camera.
 * Mutates `ctx.bounds` to collect min/max for normalization across all visited nodes.
 * Mutates/reads `ctx.priorityStateMap` to store per-node priority state.
 */
export function computeNodeMetrics(
    node: CachedNode,
    depth: number,
    ctx: MetricsContext,
): NodeMetrics {
    const bboxMeters = projectAabbToMeters(node.boundsWgs84, ctx.projector);
    const distanceToCamera = computeDistanceToCamera(
        ctx.cameraPosMeters,
        bboxMeters,
    );

    const geometricError = ctx.geometricErrorByDepth(depth);
    const screenError = getScreenSpaceError(geometricError, distanceToCamera, {
        fovVerticalRadians: ctx.camera.fovRadians,
        screenHeightPx: ctx.camera.screenHeightPx,
        pixelRatio: ctx.camera.pixelRatio,
    });

    const reverseSSE = 1 / Math.max(screenError, EPSILON7);

    const tileCenterMeters: [number, number, number] = [
        (bboxMeters.minX + bboxMeters.maxX) / 2,
        (bboxMeters.minY + bboxMeters.maxY) / 2,
        (bboxMeters.minZ + bboxMeters.maxZ) / 2,
    ];
    const foveatedFactor = computeFoveatedFactor(
        tileCenterMeters,
        ctx.cameraPosMeters,
        ctx.camera.cameraDirection,
    );

    ctx.bounds.minDistance = Math.min(ctx.bounds.minDistance, distanceToCamera);
    ctx.bounds.maxDistance = Math.max(ctx.bounds.maxDistance, distanceToCamera);
    ctx.bounds.minDepth = Math.min(ctx.bounds.minDepth, depth);
    ctx.bounds.maxDepth = Math.max(ctx.bounds.maxDepth, depth);
    ctx.bounds.minFoveatedFactor = Math.min(
        ctx.bounds.minFoveatedFactor,
        foveatedFactor,
    );
    ctx.bounds.maxFoveatedFactor = Math.max(
        ctx.bounds.maxFoveatedFactor,
        foveatedFactor,
    );
    ctx.bounds.minReverseSSE = Math.min(ctx.bounds.minReverseSSE, reverseSSE);
    ctx.bounds.maxReverseSSE = Math.max(ctx.bounds.maxReverseSSE, reverseSSE);

    let state = ctx.priorityStateMap.get(node);
    if (!state) {
        state = {
            priority: 0,
            priorityHolder: node,
            distanceToCamera,
            foveatedFactor,
            depth,
            priorityReverseScreenSpaceError: reverseSSE,
        };
        ctx.priorityStateMap.set(node, state);
    } else {
        state.distanceToCamera = distanceToCamera;
        state.foveatedFactor = foveatedFactor;
        state.depth = depth;
        state.priorityReverseScreenSpaceError = reverseSSE;
    }

    const priority = updatePriority(
        node,
        ctx.bounds,
        ctx.priorityStateMap,
        ctx.priorityOptions,
    );
    state.priority = priority;

    return { screenError, priority, distanceToCamera };
}
