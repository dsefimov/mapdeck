/**
 * SSE LOD filter: select coarsest SSE-passing nodes per subtree.
 * Pure function — no side effects.
 */

import type { CachedNode } from "@core/framework/types";
import {
    type CameraSnapshot,
    buildProjection,
    projectAabbToMeters,
    computeDistanceToCamera,
    getScreenSpaceError,
} from "../geometry";
import { parseOctreeKey, getOctreeChildKeys } from "../octree/octreeKey";
import type { NodeMetadataRegistry } from "../metadata/NodeMetadataRegistry";

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
    /** Consolidated node metadata registry. */
    registry: NodeMetadataRegistry;
}

/**
 * Check if any ancestor of `node` (via the ancestor chain in the registry)
 * is in the `covered` set. Walk up at most `maxDepth` steps.
 */
function hasCoveredAncestor(
    node: CachedNode,
    covered: Set<string>,
    registry: NodeMetadataRegistry,
): boolean {
    let ancestor: CachedNode | undefined = node;
    for (let i = 0; i < 32; i++) {
        const links = registry.ancestors.get(ancestor);
        if (!links?.ancestorWithContent) break;
        ancestor = links.ancestorWithContent;
        if (covered.has(ancestor.key)) return true;
    }
    return false;
}

/**
 * Walk up the ancestor chain to find a loaded ancestor for fallback rendering.
 */
function findLoadedAncestor(
    node: CachedNode,
    registry: NodeMetadataRegistry,
): CachedNode | null {
    let ancestor: CachedNode | undefined =
        registry.ancestors.get(node)?.ancestorWithContentAvailable;
    for (let i = 0; i < 32 && ancestor; i++) {
        if (ancestor.state === "loaded") return ancestor;
        ancestor =
            registry.ancestors.get(ancestor)?.ancestorWithContentAvailable;
    }
    return null;
}

/**
 * Apply SSE LOD selection and return visible node keys for rendering.
 *
 * SSE rule (coarsest-passing-per-subtree):
 * - Iterates nodes by depth ASC (coarsest first).
 * - If a node's screenError ≤ maxScreenErrorPx: it's sufficiently detailed →
 *   include it, mark its entire subtree as "covered" (descendants skipped).
 * - If a node's screenError > maxScreenErrorPx: too coarse. If it has loaded
 *   children, skip it. Otherwise, use ancestor fallback; if none, render as-is.
 */
export function applySSEFilter(input: SSEFilterInput): string[] {
    const {
        frustumVisible,
        nodeCache,
        camera,
        geometricErrorByDepth,
        maxScreenErrorPx,
    } = input;

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

    const sseContext = {
        fovVerticalRadians: camera.fovRadians,
        screenHeightPx: camera.screenHeightPx,
        pixelRatio: camera.pixelRatio,
    };

    for (const node of frustumVisible) {
        if (hasCoveredAncestor(node, covered, input.registry)) continue;

        const [depth] = parseOctreeKey(node.key);
        const geometricError = geometricErrorByDepth(depth);
        const bboxMeters = projectAabbToMeters(node.boundsWgs84, projector);
        const distanceToCamera = computeDistanceToCamera(
            cameraPosMeters,
            bboxMeters,
        );
        const screenError = getScreenSpaceError(
            geometricError,
            distanceToCamera,
            sseContext,
        );

        if (screenError <= maxScreenErrorPx) {
            result.push(node.key);
            covered.add(node.key);
        } else {
            processCoarseNode(
                node,
                nodeCache,
                { result, covered },
                input.registry,
            );
        }
    }

    return result.sort((a, b) => a.localeCompare(b));
}

/**
 * Handle a node that failed SSE: check for loaded children,
 * fall back to ancestor, or render as-is.
 */
function processCoarseNode(
    node: CachedNode,
    nodeCache: ReadonlyMap<string, CachedNode>,
    output: { result: string[]; covered: Set<string> },
    registry: NodeMetadataRegistry,
): void {
    const childKeys = getOctreeChildKeys(node.key);
    const hasLoadedChild = childKeys.some((ck: string) => {
        const childNode = nodeCache.get(ck);
        return childNode?.state === "loaded";
    });

    if (!hasLoadedChild) {
        const fallbackNode = findLoadedAncestor(node, registry);
        if (fallbackNode) {
            output.result.push(fallbackNode.key);
            output.covered.add(fallbackNode.key);
        } else {
            output.result.push(node.key);
        }
    }
}
