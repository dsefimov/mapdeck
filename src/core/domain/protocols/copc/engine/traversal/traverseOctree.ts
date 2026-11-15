/**
 * Octree traversal for SSE-based LOD.
 * Pure functions: takes node cache + camera state, returns candidate list.
 * No side effects, no I/O.
 */

import RBush from "rbush";
import type { BBox3D } from "@core/lib/geo";
import {
    computeGroundResolution,
    MIN_GROUND_RES,
    projectCameraToMeters,
} from "../geometry";
import type { CameraSnapshot } from "../geometry";
import type {
    CachedNode,
    CandidateNode,
} from "../../types";
import type { PriorityBounds, PriorityState } from "../priority";
import { visitNode, type VisitorContext } from "./visitor";

/** Result of one octree traversal. */
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

/** Index entry for a node's WGS84 horizontal extent. */
export function toNodeBBoxEntry(
    key: string,
    boundsWgs84: BBox3D,
): NodeBBoxEntry {
    return {
        minX: boundsWgs84.minX,
        minY: boundsWgs84.minY,
        maxX: boundsWgs84.maxX,
        maxY: boundsWgs84.maxY,
        key,
    };
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
 * Accounts for maxScreenErrorPx: a higher threshold means coarser data is
 * acceptable, so the cap gets shallower. Doubling the distance costs one level,
 * since ground resolution grows with distance.
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
 * Everything one traversal needs. The caller already holds these as two
 * groups — the orchestrator's immutable deps and the per-cycle camera
 * input — so the request mirrors that split instead of flattening nine
 * positional parameters.
 */
export interface TraversalRequest {
    rootKey: string;
    nodeCache: Map<string, CachedNode>;
    spatialIndex: RBush<NodeBBoxEntry>;
    priorityStateMap: WeakMap<CachedNode, PriorityState>;
    maxOctreeDepth: number;
    camera: CameraSnapshot;
    viewportBounds: [number, number, number, number];
    maxScreenErrorPx: number;
    geometricErrorByDepth: (depth: number) => number;
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
export function traverseOctree(request: TraversalRequest): TraversalResult {
    const {
        rootKey,
        nodeCache,
        spatialIndex,
        priorityStateMap,
        maxOctreeDepth,
        camera,
        viewportBounds,
        maxScreenErrorPx,
        geometricErrorByDepth,
    } = request;

    const [west, south, east, north] = viewportBounds;
    const rbushResults = spatialIndex.search({
        minX: west,
        minY: south,
        maxX: east,
        maxY: north,
    });

    const rbushKeySet = new Set(rbushResults.map((e) => e.key));

    const { projector, cameraPosMeters } = projectCameraToMeters(
        camera.cameraPos,
    );

    const bounds: PriorityBounds = {
        minDepth: Infinity,
        maxDepth: -Infinity,
        minFoveatedFactor: Infinity,
        maxFoveatedFactor: -Infinity,
        minReverseSSE: Infinity,
        maxReverseSSE: -Infinity,
    };

    const ctx: VisitorContext = {
        nodeCache,
        cullingInput: {
            rbushKeySet,
            camera,
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
