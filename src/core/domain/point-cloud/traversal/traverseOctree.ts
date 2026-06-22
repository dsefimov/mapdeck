/**
 * Octree traversal for SSE-based LOD.
 * Pure functions: takes node cache + camera state, returns candidate list.
 * No side effects, no I/O.
 */

import RBush from "rbush";
import {
    buildProjection,
    computeGroundResolution,
    MIN_GROUND_RES,
} from "../geometry";
import type { CameraSnapshot } from "../geometry";
import type { CachedNode, CandidateNode } from "@core/framework/types";
import type { PriorityBounds, PriorityState } from "../priority";
import { visitNode, type VisitorContext } from "./visitor";
import { type PriorityOptions } from "../priority";

export interface TraversalResult {
    candidates: CandidateNode[];
    /** childKey → parentKey mapping for parent-fallback tracking */
    fallbacks: Map<string, string>;
    /** Keys of nodes whose hierarchy sub-page needs loading before children can be traversed */
    pendingHierarchyExpansions: string[];
    /** Min/max bounds of continuous priority criteria collected across all visited nodes. */
    priorityBounds: PriorityBounds;
}

/** RBush spatial index entry for XY prefiltering. */
export interface NodeBBoxEntry {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    key: string;
}

/**
 * Input context for anti-overzoom depth cap computation.
 * All five fields form a single logical context: "how deep can this node go
 * under these camera conditions?"
 */
export interface AntiOverzoomInput {
    rootSpacing: number;
    distanceToCamera: number;
    camera: CameraSnapshot;
    maxOctreeDepth: number;
    maxScreenErrorPx: number;
}

/**
 * Hard depth cap for a single node based on its distance to the camera.
 * Uses the same `distanceToCamera` as SSE (meters).
 * Accounts for maxScreenErrorPx: higher threshold → deeper cap allowed.
 * Clamped to [0, maxOctreeDepth]; NaN/Infinity → maxOctreeDepth.
 */
export function computeMaxDepthForNode(input: AntiOverzoomInput): number {
    const {
        rootSpacing,
        distanceToCamera,
        camera,
        maxOctreeDepth,
        maxScreenErrorPx,
    } = input;
    // Anti-overzoom guard is only meaningful at high altitudes (10km+).
    // At close range (< 2km), disable it entirely — SSE alone determines LOD.
    if (distanceToCamera < 2000) {
        return maxOctreeDepth;
    }

    const groundRes = computeGroundResolution(
        distanceToCamera,
        camera.fovRadians,
        camera.screenHeightPx,
    );
    const effectiveRes = Math.max(groundRes * maxScreenErrorPx, MIN_GROUND_RES);
    const ratio = rootSpacing / effectiveRes;

    if (!isFinite(ratio) || ratio <= 0) {
        return maxOctreeDepth;
    }

    // Allow 2 extra levels beyond the strict formula.
    const rawDepthCap = Math.floor(Math.log2(ratio)) + 2;
    return Math.max(0, Math.min(rawDepthCap, maxOctreeDepth));
}

/**
 * Top-down octree traversal using SSE-based LOD.
 *
 * **Fixed evaluation order per node (cheapest → most expensive):**
 * 1. RBush XY prefilter — coarse AABB overlap via viewport bounds (index must be pre-built externally)
 * 2. 3D frustum culling — project AABB to common space via viewport.projectPosition(),
 *    offset by viewport.center, then test against deck.gl frustum planes
 * 3. Build proj4 projection (once per traversal) + project AABB + anti-overzoom + SSE
 *
 * The `spatialIndex` is managed externally and updated incrementally when nodes
 * are added to cache — NOT rebuilt from scratch on each traversal.
 *
 * proj4 `.forward()` is deliberately LAST because it's the most expensive
 * operation in the hot path. Do not reorder steps.
 */
// eslint-disable-next-line max-params
export function traverseOctree(
    rootKey: string,
    nodeCache: Map<string, CachedNode>,
    spatialIndex: RBush<NodeBBoxEntry>,
    camera: CameraSnapshot,
    viewportBounds: [number, number, number, number],
    maxScreenErrorPx: number,
    maxOctreeDepth: number,
    geometricErrorByDepth: (depth: number) => number,
    priorityStateMap: WeakMap<CachedNode, PriorityState>,
): TraversalResult {
    const [west, south, east, north] = viewportBounds;
    const rbushResults = spatialIndex.search({
        minX: west,
        minY: south,
        maxX: east,
        maxY: north,
    });

    const rbushKeySet = new Set(rbushResults.map((e) => e.key));

    const projector = buildProjection(camera.cameraPos[0], camera.cameraPos[1]);

    const [camXMeters, camYMeters] = projector.forward([
        camera.cameraPos[0],
        camera.cameraPos[1],
    ]);
    const cameraPosMeters: [number, number, number] = [
        camXMeters,
        camYMeters,
        camera.cameraPos[2],
    ];

    const bounds: PriorityBounds = {
        minDistance: Infinity,
        maxDistance: -Infinity,
        minDepth: Infinity,
        maxDepth: -Infinity,
        minFoveatedFactor: Infinity,
        maxFoveatedFactor: -Infinity,
        minReverseSSE: Infinity,
        maxReverseSSE: -Infinity,
    };

    /** Priority options: base traversal uses reverse-SSE as preferred sort. */
    const priorityOptions: PriorityOptions = {
        isSkippingLevelOfDetail: false,
    };

    const ctx: VisitorContext = {
        nodeCache,
        cullingInput: {
            rbushKeySet,
            camera,
            camCommonZ: camera.camCommonZ,
            cameraPosMeters,
            projector,
            geometricErrorByDepth,
            maxOctreeDepth,
            maxScreenErrorPx,
        },
        metricsInput: {
            projector,
            cameraPosMeters,
            camera,
            geometricErrorByDepth,
            bounds,
            priorityStateMap,
            priorityOptions,
        },
        maxScreenErrorPx,
        maxOctreeDepth,
        candidates: [],
        fallbacks: new Map(),
        pendingHierarchyExpansions: [],
    };

    visitNode(rootKey, null, ctx);

    return {
        candidates: ctx.candidates,
        fallbacks: ctx.fallbacks,
        pendingHierarchyExpansions: ctx.pendingHierarchyExpansions,
        priorityBounds: bounds,
    };
}
