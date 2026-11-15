/**
 * SSE LOD filter: select coarsest SSE-passing nodes per subtree.
 * Pure function — no side effects.
 */

import type { CachedNode } from "../../types";
import {
    type CameraSnapshot,
    type NodeSseContext,
    computeNodeScreenError,
    projectCameraToMeters,
} from "../geometry";
import { parseOctreeKey, getOctreeChildKeys } from "../octree/octreeKey";

/** Input context for applySSEFilter. */
export interface SSEFilterInput {
    /** Pre-filtered and depth-sorted node list. */
    frustumVisible: CachedNode[];
    /** All cached nodes. */
    nodeCache: ReadonlyMap<string, CachedNode>;
    /** Current camera state. */
    camera: CameraSnapshot;
    /** Geometric error function by depth. */
    geometricErrorByDepth: (depth: number) => number;
    /** SSE threshold in pixels. */
    maxScreenErrorPx: number;
}

/** Hard cap on the parent-chain walk — guards against malformed chains; not
 *  tied to maxOctreeDepth (20), just a safe upper bound for any real octree. */
const MAX_ANCESTOR_STEPS = 32;

/**
 * Check if any ancestor of `node` (via the parent chain) is in the
 * `covered` set. Walk up at most `maxDepth` steps.
 */
function hasCoveredAncestor(node: CachedNode, covered: Set<string>): boolean {
    let ancestor = node.parent;
    for (let i = 0; i < MAX_ANCESTOR_STEPS && ancestor; i++) {
        if (covered.has(ancestor.key)) return true;
        ancestor = ancestor.parent;
    }
    return false;
}

/**
 * Apply SSE LOD selection and return visible node keys for rendering.
 *
 * SSE rule (coarsest-passing-per-subtree):
 * - Iterates nodes by depth ASC (coarsest first).
 * - If a node's screenError ≤ maxScreenErrorPx: it's sufficiently detailed →
 *   include it, mark its entire subtree as "covered" (descendants skipped).
 * - If a node's screenError > maxScreenErrorPx: too coarse. It yields to its
 *   children only once every discovered child has loaded; a partially
 *   loaded family keeps the coarse parent on screen as the fallback for the
 *   regions of the children still missing.
 */
export function applySSEFilter(input: SSEFilterInput): string[] {
    const { frustumVisible, nodeCache, camera, geometricErrorByDepth, maxScreenErrorPx } =
        input;

    const sseCtx: NodeSseContext = {
        ...projectCameraToMeters(camera.cameraPos),
        camera,
        geometricErrorByDepth,
    };
    const covered = new Set<string>();
    const result: string[] = [];

    for (const node of frustumVisible) {
        if (hasCoveredAncestor(node, covered)) continue;

        const [depth] = parseOctreeKey(node.key);
        const screenError = computeNodeScreenError(
            node.boundsWgs84,
            depth,
            sseCtx,
        );

        if (screenError <= maxScreenErrorPx) {
            result.push(node.key);
            covered.add(node.key);
        } else {
            processCoarseNode(node, nodeCache, { result, covered });
        }
    }

    return result.sort((a, b) => a.localeCompare(b));
}

/**
 * Handle a node that failed SSE: keep rendering it until every discovered
 * child has loaded — it is the only fallback for the regions of the ones
 * still missing. A node without discovered children has nothing to yield to.
 */
function processCoarseNode(
    node: CachedNode,
    nodeCache: ReadonlyMap<string, CachedNode>,
    output: { result: string[]; covered: Set<string> },
): void {
    if (shouldYieldToChildren(node, nodeCache)) return;
    output.result.push(node.key);
}

/**
 * Whether a coarse node's children cover it entirely: at least one child
 * exists in the cache and every one of them is fully loaded.
 */
function shouldYieldToChildren(
    node: CachedNode,
    nodeCache: ReadonlyMap<string, CachedNode>,
): boolean {
    let sawChild = false;
    for (const ck of getOctreeChildKeys(node.key)) {
        const childNode = nodeCache.get(ck);
        if (!childNode) continue;
        sawChild = true;
        if (childNode.state !== "loaded") return false;
    }
    return sawChild;
}
