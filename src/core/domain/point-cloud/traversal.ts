/**
 * Octree traversal for SSE-based LOD.
 * Pure functions: takes node cache + camera state, returns candidate list.
 * No side effects, no I/O.
 */

import RBush from "rbush";
import { logger } from "@core/shared/diagnostics/logger";
import {
    buildProjection,
    projectAabbToMeters,
    computeDistanceToCamera,
    computeScreenError,
    computeGroundResolution,
    computeBoundingSphereRadius,
    computeScreenProjectedArea,
    projectNodeBoundsToCommonSpace,
    isAabbInFrustumPlanes,
    MIN_GROUND_RES,
} from "./geometry";
import type { CameraSnapshot, BBox3D } from "./geometry";
import type { CachedNode } from "@core/framework/types";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CandidateNode {
    key: string;
    screenError: number;
    screenProjectedArea: number;
    priority: number;
    distanceToCamera: number;
}

export interface TraversalResult {
    candidates: CandidateNode[];
    /** childKey → parentKey mapping for parent-fallback tracking */
    fallbacks: Map<string, string>;
    /** Keys of nodes whose hierarchy sub-page needs loading before children can be traversed */
    pendingHierarchyExpansions: string[];
}

/** RBush spatial index entry for XY prefiltering. */
interface NodeBBoxEntry {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    key: string;
}

// ── 2.2 anti-overzoom per-node ─────────────────────────────────────────────

/**
 * Hard depth cap for a single node based on its distance to the camera.
 * Uses the same `distanceToCamera` as SSE (meters).
 * Accounts for maxScreenErrorPx: higher threshold → deeper cap allowed.
 * Clamped to [0, maxOctreeDepth]; NaN/Infinity → maxOctreeDepth.
 */
// eslint-disable-next-line max-params
export function computeMaxDepthForNode(
    rootSpacing: number,
    distanceToCamera: number,
    camera: CameraSnapshot,
    maxOctreeDepth: number,
    maxScreenErrorPx: number,
): number {
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
    // Effective resolution scaled by SSE threshold:
    // with maxScreenErrorPx=2, we can tolerate 2× coarser nodes → cap is higher.
    const effectiveRes = Math.max(groundRes * maxScreenErrorPx, MIN_GROUND_RES);
    const ratio = rootSpacing / effectiveRes;

    if (!isFinite(ratio) || ratio <= 0) {
        return maxOctreeDepth;
    }

    // Allow 2 extra levels beyond the strict formula.
    // The cap exists to prevent request explosion at extreme altitudes (10km+ on 4K),
    // not to block legitimate detail at moderate altitudes (100-500m).
    const rawDepthCap = Math.floor(Math.log2(ratio)) + 2;
    return Math.max(0, Math.min(rawDepthCap, maxOctreeDepth));
}

// ── Traversal helpers ───────────────────────────────────────────────────────

/**
 * Parse an octree node key "D-X-Y-Z" into its components.
 */
function parseNodeKey(key: string): [number, number, number, number] {
    const parts = key.split("-").map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
        throw new Error(`Invalid node key: ${key}`);
    }
    return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
}

/**
 * Build child key strings for a given node key.
 * Each node in an octree has up to 8 children (2×2×2 subdivision).
 */
function getChildKeys(parentKey: string): string[] {
    const [d, x, y, z] = parseNodeKey(parentKey);
    const childDepth = d + 1;
    const children: string[] = [];
    for (let dx = 0; dx <= 1; dx++) {
        for (let dy = 0; dy <= 1; dy++) {
            for (let dz = 0; dz <= 1; dz++) {
                children.push(
                    `${childDepth}-${x * 2 + dx}-${y * 2 + dy}-${z * 2 + dz}`,
                );
            }
        }
    }
    return children;
}

// ── 2.3 traverseOctree ─────────────────────────────────────────────────────

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
): TraversalResult {
    const candidates: CandidateNode[] = [];
    const fallbacks = new Map<string, string>();
    const pendingHierarchyExpansions: string[] = [];

    const [west, south, east, north] = viewportBounds;
    const rbushResults = spatialIndex.search({
        minX: west,
        minY: south,
        maxX: east,
        maxY: north,
    });

    const rbushKeySet = new Set(rbushResults.map((e) => e.key));

    let rbushHits = 0;
    let frustumPassed = 0;
    let depthCapCulled = 0;
    let sseStopped = 0;
    let sseDescended = 0;
    let leafAccepted = 0;

    // Build projection once for this traversal (expensive setup — O(1))
    // Use the camera position as the projection center.
    const projector = buildProjection(camera.cameraPos[0], camera.cameraPos[1]);

    const [camXMeters, camYMeters] = projector.forward([
        camera.cameraPos[0],
        camera.cameraPos[1],
    ]);
    const cameraPosMeters: [number, number, number] = [
        camXMeters,
        camYMeters,
        camera.cameraPos[2], // Z is already in meters
    ];

    // Camera Z in common space — used for Z-axis offset.
    // center.Z can be 0 when position is not set in viewport,
    // causing far-plane false culling for nodes above sea level.
    const camCommonZ = camera.projectToCommonSpace(
        camera.cameraPos[0],
        camera.cameraPos[1],
        camera.cameraPos[2],
    )[2];

    // eslint-disable-next-line complexity, sonarjs/cognitive-complexity
    function visitNode(key: string, parentKey: string | null): void {
        const node = nodeCache.get(key);
        if (!node) return;

        const [depth] = parseNodeKey(key);

        if (!rbushKeySet.has(key)) {
            return; // outside viewport XY bounds — cull entire subtree
        }
        rbushHits++;

        // then test against the 6 frustum planes.
        const nodeBBoxDeg: BBox3D = {
            minX: node.boundsWgs84.minX,
            minY: node.boundsWgs84.minY,
            minZ: node.boundsWgs84.minZ,
            maxX: node.boundsWgs84.maxX,
            maxY: node.boundsWgs84.maxY,
            maxZ: node.boundsWgs84.maxZ,
        };

        // via viewport.projectPosition(), then offset by viewport.center
        // to align with frustum-plane coordinate system.
        const bboxMercator = projectNodeBoundsToCommonSpace(
            nodeBBoxDeg,
            camera.projectToCommonSpace,
            camera.centerOffset,
            camCommonZ,
        );

        if (!isAabbInFrustumPlanes(bboxMercator, camera.frustumPlanes)) {
            return; // outside frustum — cull
        }
        frustumPassed++;

        const bboxMeters = projectAabbToMeters(nodeBBoxDeg, projector);

        const distanceToCamera = computeDistanceToCamera(
            cameraPosMeters,
            bboxMeters,
        );

        const depthCap = computeMaxDepthForNode(
            geometricErrorByDepth(0), // geometricError(0) = rootSpacing
            distanceToCamera,
            camera,
            maxOctreeDepth,
            maxScreenErrorPx,
        );

        if (depth > depthCap) {
            depthCapCulled++;
            return; // exceeds anti-overzoom cap for this distance
        }

        const geometricError = geometricErrorByDepth(depth);
        const screenError = computeScreenError(
            geometricError,
            distanceToCamera,
            camera.fovRadians,
            camera.screenHeightPx,
        );

        const boundingSphereRadius = computeBoundingSphereRadius(bboxMeters);
        const screenProjectedArea = computeScreenProjectedArea(
            boundingSphereRadius,
            distanceToCamera,
            camera.fovRadians,
            camera.screenHeightPx,
        );

        const priority = screenError * screenProjectedArea;

        const childKeys = getChildKeys(key);
        const hasAnyChild = childKeys.some((ck) => nodeCache.has(ck));

        if (screenError <= maxScreenErrorPx || !hasAnyChild) {
            // Node is sufficiently detailed, OR is a leaf (no children in cache).
            // Flag for hierarchy expansion only if children COULD exist:
            // depth < maxOctreeDepth AND (depth < maxDepthInHierarchy OR hierarchy not yet loaded).
            if (
                !hasAnyChild &&
                screenError > maxScreenErrorPx &&
                depth < maxOctreeDepth
            ) {
                pendingHierarchyExpansions.push(key);
            }
            if (!hasAnyChild) leafAccepted++;
            else sseStopped++;

            candidates.push({
                key,
                screenError,
                screenProjectedArea,
                priority,
                distanceToCamera,
            });

            // Track fallback relationship if this is a child
            if (parentKey !== null) {
                fallbacks.set(key, parentKey);
            }
            return; // stop traversal on this branch
        }

        // Node is too coarse — keep as fallback, descend to children
        sseDescended++;
        candidates.push({
            key,
            screenError,
            screenProjectedArea,
            priority,
            distanceToCamera,
        });

        if (parentKey !== null) {
            fallbacks.set(key, parentKey);
        }

        // Descend to children
        for (const childKey of getChildKeys(key)) {
            if (nodeCache.has(childKey)) {
                visitNode(childKey, key);
            }
        }
    }

    // Start traversal from root
    visitNode(rootKey, null);

    logger.debug(
        `[TRAVERSAL] rbushTotal=${rbushResults.length}, rbushHits=${rbushHits}, ` +
            `frustumPassed=${frustumPassed}, depthCapCulled=${depthCapCulled}, ` +
            `sseStopped=${sseStopped}, sseDescended=${sseDescended}, ` +
            `leafAccepted=${leafAccepted}, candidates=${candidates.length}`,
    );

    return { candidates, fallbacks, pendingHierarchyExpansions };
}
