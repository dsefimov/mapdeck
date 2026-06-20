/**
 * Eviction planning for point-cloud streaming.
 *
 * Selects loaded nodes farthest from the camera for eviction.
 * Never touches nodes in "loading" state — their budget is already
 * reserved by computeBudgetPlan.
 *
 * Mutates node.distanceToCamera on cached nodes with a fresh
 * projection-based distance. Callers rely on these updated distances
 * for subsequent operations (e.g., traversal priority).
 */

import type { CachedNode, EvictionPlan } from "@core/framework/types";
import {
    buildProjection,
    projectAabbToMeters,
    computeDistanceToCamera,
} from "../geometry";

/**
 * Compute an eviction plan: which loaded nodes to evict to free the required
 * number of points. Victims are selected by distance to camera (farthest first),
 * recomputed fresh from the current camera position.
 *
 * Only `state === "loaded"` nodes are eligible. "loading" nodes are never evicted
 * — their budget is pre-reserved in computeBudgetPlan.
 *
 * If not enough loaded nodes exist to meet `requiredPoints`, the returned plan
 * evicts all eligible nodes and reports the actual freed points. The caller
 * must truncate `toLoad` accordingly.
 *
 * @param nodeCache - All cached nodes.
 * @param requiredPoints - Number of points that need to be freed.
 * @param cameraPosMeters - Camera position in projected meters [x, y, z].
 * @param projector - Proj4 projection object (built from camera position).
 */
export function computeEvictionPlan(
    nodeCache: ReadonlyMap<string, CachedNode>,
    requiredPoints: number,
    cameraPosMeters: [number, number, number],
    projector: ReturnType<typeof buildProjection>,
): EvictionPlan {
    // Only loaded nodes with a valid buffer position are eligible.
    // loading nodes are never evicted — their budget is pre-reserved.
    const candidates: CachedNode[] = [];
    for (const [, node] of nodeCache) {
        if (node.state === "loaded" && node.positions !== undefined) {
            candidates.push(node);
        }
    }

    if (candidates.length === 0 || requiredPoints <= 0) {
        return { keysToEvict: [], freedPoints: 0 };
    }

    // Recompute distance for every loaded node at current camera position
    for (const node of candidates) {
        const bboxMeters = projectAabbToMeters(node.boundsWgs84, projector);
        node.distanceToCamera = computeDistanceToCamera(
            cameraPosMeters,
            bboxMeters,
        );
    }

    candidates.sort(
        (a, b) => (b.distanceToCamera ?? 0) - (a.distanceToCamera ?? 0),
    );

    const keysToEvict: string[] = [];
    let freedPoints = 0;

    for (const node of candidates) {
        if (freedPoints >= requiredPoints) break;
        keysToEvict.push(node.key);
        freedPoints += node.pointCount;
    }

    return { keysToEvict, freedPoints };
}
