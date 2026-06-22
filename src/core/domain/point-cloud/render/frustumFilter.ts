/**
 * Frustum prefilter: narrow nodeCache to frustum-visible nodes, sorted by depth.
 * Pure function — no side effects.
 */

import type { CachedNode } from "@core/framework/types";
import {
    type CameraSnapshot,
    projectNodeBoundsToCommonSpace,
    isAabbInFrustumPlanes,
} from "../geometry";
import { parseOctreeKey } from "../octree/octreeKey";

/**
 * Filter nodes by frustum visibility and sort by depth ASC.
 *
 * - Projects each node's WGS84 AABB to common space via
 *   camera.projectToCommonSpace with camera.centerOffset.
 * - Tests against the 6 frustum planes.
 * - Sorts by octree depth (coarsest first), then lexicographic key.
 *
 * Only considers nodes with `state === "loaded"`.
 */
export function filterFrustumVisible(
    nodeCache: ReadonlyMap<string, CachedNode>,
    camera: CameraSnapshot,
): CachedNode[] {
    const camCommonZ = camera.camCommonZ;

    const entries: [CachedNode, number][] = [];

    for (const [, node] of nodeCache) {
        if (node.state !== "loaded") continue;

        const bbox = projectNodeBoundsToCommonSpace(
            node.boundsWgs84,
            camera.projectToCommonSpace,
            camera.centerOffset,
            camCommonZ,
        );

        if (isAabbInFrustumPlanes(bbox, camera.frustumPlanes)) {
            const [depth] = parseOctreeKey(node.key);
            entries.push([node, depth]);
        }
    }

    if (entries.length === 0) return [];

    entries.sort((a, b) => {
        const da = a[1];
        const db = b[1];
        if (da !== db) return da - db;
        return a[0].key.localeCompare(b[0].key);
    });

    return entries.map(([node]) => node);
}
