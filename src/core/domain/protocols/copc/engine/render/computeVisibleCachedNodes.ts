/**
 * Pure function: which cached nodes to render in the current frame.
 * Thin orchestrator: frustum filter → SSE filter → return.
 */

import type { CachedNode } from "../../types";
import type { CameraSnapshot } from "../geometry";
import { filterFrustumVisible } from "./frustumFilter";
import { applySSEFilter, type SSEFilterInput } from "./sseFilter";

/** SSE config needed by the render pipeline. */
export interface RenderContext {
    geometricErrorByDepth: (depth: number) => number;
    maxScreenErrorPx: number;
}

/**
 * Compute visible cached nodes: frustum-filtered, then SSE-filtered.
 */
export function computeVisibleCachedNodes(
    nodeCache: ReadonlyMap<string, CachedNode>,
    camera: CameraSnapshot,
    ctx: RenderContext,
): string[] {
    const frustumVisible = filterFrustumVisible(nodeCache, camera);
    if (frustumVisible.length === 0) return [];

    const sseInput: SSEFilterInput = {
        frustumVisible,
        nodeCache,
        camera,
        ...ctx,
    };
    return applySSEFilter(sseInput);
}
