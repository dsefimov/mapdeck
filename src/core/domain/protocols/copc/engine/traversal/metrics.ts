import type { CameraSnapshot } from "../geometry";
import type { CachedNode } from "../../types";
import type { Converter } from "proj4";
import {
    projectAabbToMeters,
    computeDistanceToCamera,
    bboxCenter,
    getScreenSpaceError,
    sseCameraContext,
} from "../geometry";
import type { PriorityBounds, PriorityState } from "../priority";
import { accumulatePriorityBounds, getState, updatePriority } from "../priority";

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

/** Raw measurements of one node under the traversal camera. */
interface NodeMeasurements {
    screenError: number;
    distanceToCamera: number;
    reverseSSE: number;
    foveatedFactor: number;
}

/** Project the node and measure distance, screen error and foveated weight. */
function measureNode(
    node: CachedNode,
    depth: number,
    ctx: MetricsContext,
): NodeMeasurements {
    const bboxMeters = projectAabbToMeters(node.boundsWgs84, ctx.projector);
    const distanceToCamera = computeDistanceToCamera(
        ctx.cameraPosMeters,
        bboxMeters,
    );
    const screenError = getScreenSpaceError(
        ctx.geometricErrorByDepth(depth),
        distanceToCamera,
        sseCameraContext(ctx.camera),
    );
    return {
        screenError,
        distanceToCamera,
        reverseSSE: 1 / Math.max(screenError, EPSILON7),
        foveatedFactor: computeFoveatedFactor(
            bboxCenter(bboxMeters),
            ctx.cameraPosMeters,
            ctx.camera.cameraDirection,
        ),
    };
}

/** Store this traversal's measurements in the node's priority-state side-car. */
function refreshPriorityState(
    node: CachedNode,
    priorityStateMap: WeakMap<CachedNode, PriorityState>,
    depth: number,
    measurements: NodeMeasurements,
): PriorityState {
    const state = getState(node, priorityStateMap);
    state.distanceToCamera = measurements.distanceToCamera;
    state.foveatedFactor = measurements.foveatedFactor;
    state.depth = depth;
    state.priorityReverseScreenSpaceError = measurements.reverseSSE;
    return state;
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
    const measurements = measureNode(node, depth, ctx);
    accumulatePriorityBounds(ctx.bounds, {
        depth,
        foveatedFactor: measurements.foveatedFactor,
        reverseSSE: measurements.reverseSSE,
    });
    const state = refreshPriorityState(
        node,
        ctx.priorityStateMap,
        depth,
        measurements,
    );
    state.priority = updatePriority(node, ctx.bounds, ctx.priorityStateMap);

    return {
        screenError: measurements.screenError,
        priority: state.priority,
        distanceToCamera: measurements.distanceToCamera,
    };
}
