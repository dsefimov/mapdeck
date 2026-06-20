/**
 * Pure function: which cached nodes to render in the current frame.
 *
 * Two-stage filter:
 * 1. Frustum culling — 8-corner AABB projection + isAabbInFrustumPlanes
 * 2. SSE LOD — render the coarsest node that passes the SSE threshold per subtree;
 *    children of SSE-passing nodes are skipped (GPU bandwidth savings).
 *
 * Stateless — reads nodeCache, returns keys. No budget, no network, no side effects.
 */

import type { CachedNode } from "@core/framework/types";
import {
    type CameraSnapshot,
    projectNodeBoundsToCommonSpace,
    isAabbInFrustumPlanes,
    buildProjection,
    projectAabbToMeters,
    computeDistanceToCamera,
    computeScreenError,
} from "../geometry";
import { logger } from "@core/shared/diagnostics/logger";

/**
 * Parse octree key "D-X-Y-Z" into components.
 */
function parseKey(key: string): [number, number, number, number] {
    const [d, x, y, z] = key.split("-").map(Number);
    return [d!, x!, y!, z!];
}

/**
 * Check if `descendantKey` is in the subtree rooted at `ancestorKey`.
 * Both are octree keys "D-X-Y-Z".
 */
function isDescendantOf(descendantKey: string, ancestorKey: string): boolean {
    const [dA, xA, yA, zA] = parseKey(ancestorKey);
    const [dD, xD, yD, zD] = parseKey(descendantKey);
    if (dD <= dA) return false;

    const shift = dD - dA;
    const mask = (1 << shift) - 1;
    // Ancestor coordinates scaled to descendant depth
    const ax = xA << shift;
    const ay = yA << shift;
    const az = zA << shift;
    // Descendant must lie within the ancestor's octant
    return (
        xD >= ax &&
        xD <= ax + mask &&
        yD >= ay &&
        yD <= ay + mask &&
        zD >= az &&
        zD <= az + mask
    );
}

/**
 * Compute visible cached nodes: frustum-filtered, then SSE-filtered.
 *
 * SSE rule (coarsest-passing-per-subtree):
 * - Nodes are iterated by depth ASC (coarsest first).
 * - If a node's screenError ≤ maxScreenErrorPx: it's sufficiently detailed →
 *   include it, mark its entire subtree as "covered" (descendants skipped).
 * - If a node's screenError > maxScreenErrorPx: too coarse. Skip it — its
 *   children (or deeper descendants) will provide better detail. If the node
 *   has no children in cache, it's a leaf → include as fallback.
 *
 * Only nodes with `state === "loaded"` are considered.
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export function computeVisibleCachedNodes(
    nodeCache: ReadonlyMap<string, CachedNode>,
    camera: CameraSnapshot,
    geometricErrorByDepth: (depth: number) => number,
    maxScreenErrorPx: number,
): string[] {
    const camCommonZ = camera.projectToCommonSpace(
        camera.cameraPos[0],
        camera.cameraPos[1],
        camera.cameraPos[2],
    )[2];

    const frustumVisible: CachedNode[] = [];

    for (const [, node] of nodeCache) {
        if (node.state !== "loaded") continue;

        const bbox = projectNodeBoundsToCommonSpace(
            node.boundsWgs84,
            camera.projectToCommonSpace,
            camera.centerOffset,
            camCommonZ,
        );

        if (isAabbInFrustumPlanes(bbox, camera.frustumPlanes)) {
            frustumVisible.push(node);
        }
    }

    if (frustumVisible.length === 0) return [];

    frustumVisible.sort((a, b) => {
        const [da] = parseKey(a.key);
        const [db] = parseKey(b.key);
        if (da !== db) return da - db;
        return a.key.localeCompare(b.key);
    });

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

    const covered = new Set<string>();
    const result: string[] = [];

    for (const node of frustumVisible) {
        let isCovered = false;
        for (const ancestorKey of covered) {
            if (isDescendantOf(node.key, ancestorKey)) {
                isCovered = true;
                break;
            }
        }
        if (isCovered) continue;

        const [depth] = parseKey(node.key);
        const geometricError = geometricErrorByDepth(depth);
        const bboxMeters = projectAabbToMeters(node.boundsWgs84, projector);
        const distanceToCamera = computeDistanceToCamera(
            cameraPosMeters,
            bboxMeters,
        );
        const screenError = computeScreenError(
            geometricError,
            distanceToCamera,
            camera.fovRadians,
            camera.screenHeightPx,
        );

        if (screenError <= maxScreenErrorPx) {
            result.push(node.key);
            covered.add(node.key);
        } else {
            // Too coarse. Check if any children exist in cache.
            const childKeys = [
                ...Array.from({ length: 8 }, (_, i) => {
                    const [d, x, y, z] = parseKey(node.key);
                    const dc = d + 1;
                    const dx = (i & 1) !== 0 ? 1 : 0;
                    const dy = (i & 2) !== 0 ? 1 : 0;
                    const dz = (i & 4) !== 0 ? 1 : 0;
                    return `${dc}-${x * 2 + dx}-${y * 2 + dy}-${z * 2 + dz}`;
                }),
            ];
            const hasLoadedChild = childKeys.some((ck) => {
                const childNode = nodeCache.get(ck);
                return childNode?.state === "loaded";
            });

            if (!hasLoadedChild) {
                // No ready children — render this node as fallback
                // (children are loading/pending/absent, parent stays visible)
                result.push(node.key);
            }
            // If loaded children exist, skip this node — they provide better detail
        }
    }

    logger.debug(
        `[RENDER-SSE] frustumPassed=${frustumVisible.length} ssePassed=${result.length} ` +
            `covered=${covered.size}`,
    );

    return result.sort((a, b) => a.localeCompare(b));
}
