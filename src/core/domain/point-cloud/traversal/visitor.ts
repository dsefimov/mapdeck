import type { CachedNode, CandidateNode } from "@core/framework/types";
import { parseOctreeKey, getOctreeChildKeys } from "../octree/octreeKey";
import { shouldCullNode, type CullingContext } from "./culling";
import {
    computeNodeMetrics,
    type MetricsContext,
    type NodeMetrics,
} from "./metrics";

export interface VisitorContext {
    nodeCache: Map<string, CachedNode>;
    cullingInput: CullingContext;
    metricsInput: MetricsContext;
    maxScreenErrorPx: number;
    maxOctreeDepth: number;
    candidates: CandidateNode[];
    fallbacks: Map<string, string>;
    pendingHierarchyExpansions: string[];
}

/**
 * Record a node as a traversal candidate with fallback parent tracking.
 */
export function addCandidate(
    key: string,
    metrics: NodeMetrics,
    parentKey: string | null,
    ctx: VisitorContext,
): void {
    ctx.candidates.push({
        key,
        screenError: metrics.screenError,
        priority: metrics.priority,
        distanceToCamera: metrics.distanceToCamera,
    });
    if (parentKey !== null) {
        ctx.fallbacks.set(key, parentKey);
    }
}

/** Entry in the explicit DFS stack. */
interface StackEntry {
    key: string;
    parentKey: string | null;
}

/**
 * Process a single node: cull, compute metrics, determine leaf/candidate status,
 * and push children to stack if node is not a leaf.
 */
function processNode(
    stack: StackEntry[],
    key: string,
    parentKey: string | null,
    ctx: VisitorContext,
): void {
    const node = ctx.nodeCache.get(key);
    if (!node) return;

    const [depth] = parseOctreeKey(key);

    if (shouldCullNode(key, node, depth, ctx.cullingInput)) return;

    const metrics = computeNodeMetrics(node, depth, ctx.metricsInput);
    const { screenError } = metrics;

    const childKeys = getOctreeChildKeys(key);
    const hasAnyChild = childKeys.some((ck: string) => ctx.nodeCache.has(ck));

    const isLeaf = screenError <= ctx.maxScreenErrorPx || !hasAnyChild;

    if (isLeaf) {
        if (
            !hasAnyChild &&
            screenError > ctx.maxScreenErrorPx &&
            depth < ctx.maxOctreeDepth
        ) {
            ctx.pendingHierarchyExpansions.push(key);
        }
        addCandidate(key, metrics, parentKey, ctx);
        return;
    }

    addCandidate(key, metrics, parentKey, ctx);

    // Push children in reverse so first child is processed first (DFS pre-order).
    for (let i = childKeys.length - 1; i >= 0; i--) {
        const childKey = childKeys[i]!;
        if (ctx.nodeCache.has(childKey)) {
            stack.push({ key: childKey, parentKey: key });
        }
    }
}

/**
 * Visit nodes during octree traversal using iterative DFS with explicit stack.
 * Preserves identical DFS pre-order as the original recursive version.
 */
export function visitNode(
    rootKey: string,
    rootParentKey: string | null,
    ctx: VisitorContext,
): void {
    const stack: StackEntry[] = [{ key: rootKey, parentKey: rootParentKey }];

    while (stack.length > 0) {
        const { key, parentKey } = stack.pop()!;
        processNode(stack, key, parentKey, ctx);
    }
}
