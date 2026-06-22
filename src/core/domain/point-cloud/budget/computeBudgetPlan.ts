/**
 * Budget planning for point-cloud streaming.
 * Thin orchestrator: occupy → build parent/child → atomic blocks → greedy fill.
 */

import type { CachedNode, BudgetPlan } from "@core/framework/types";
import type { CandidateNode } from "@core/framework/types";
import { computeOccupiedBudget } from "./computeOccupiedBudget";
import { buildParentChildMap } from "./buildParentChildMap";
import {
    reserveSiblingBlock,
    type BlockReservationInput,
} from "./reserveSiblingBlock";

/** Context for processing a block candidate. */
interface BlockProcessContext {
    parentKey: string;
    parentToChildren: Map<string, Set<string>>;
    sorted: CandidateNode[];
    nodeCache: ReadonlyMap<string, CachedNode>;
    pointBudget: number;
    accepted: Set<string>;
    processedBlocks: Set<string>;
}

/**
 * Process a candidate that has a parent-fallback relationship.
 * Tries atomic block reservation first; falls back to greedy single-node acceptance.
 * `runningPointCount` is the cumulative total so far, passed incrementally from the outer loop.
 * Returns the number of additional points consumed.
 */
function processBlockCandidate(
    candidate: CandidateNode,
    ctx: BlockProcessContext,
    runningPointCount: number,
): number {
    const {
        parentKey,
        parentToChildren,
        sorted,
        nodeCache,
        pointBudget,
        accepted,
        processedBlocks,
    } = ctx;

    if (processedBlocks.has(parentKey)) return 0;

    const parentNode = nodeCache.get(parentKey);
    const siblingKeys = parentToChildren.get(parentKey) ?? new Set<string>();
    const blockCandidates: CandidateNode[] = [];
    for (const sk of siblingKeys) {
        const sc = sorted.find((c) => c.key === sk);
        if (sc) blockCandidates.push(sc);
    }
    if (!siblingKeys.has(candidate.key)) {
        blockCandidates.push(candidate);
    }

    const blockInput: BlockReservationInput = {
        parentKey,
        parentNode,
        siblingKeys,
        runningPointCount,
        pointBudget,
        nodeCache,
        accepted,
    };

    const block = reserveSiblingBlock(blockInput);
    if (block) {
        processedBlocks.add(parentKey);
        return block.pointsConsumed;
    }

    // Block doesn't fit: keep parent as fallback, accept children greedily.
    return greedyChildFill({
        parentNode,
        blockCandidates,
        nodeCache,
        pointBudget,
        accepted,
        running: runningPointCount,
        processedBlocks,
        parentKey,
    });
}

/** Context for greedy child-fill within a block. */
interface GreedyFillContext {
    parentNode: CachedNode | undefined;
    blockCandidates: CandidateNode[];
    nodeCache: ReadonlyMap<string, CachedNode>;
    pointBudget: number;
    accepted: Set<string>;
    running: number;
    processedBlocks: Set<string>;
    parentKey: string;
}

/** Greedily accept children within remaining budget when block doesn't fit. */
function greedyChildFill(ctx: GreedyFillContext): number {
    const {
        parentNode,
        blockCandidates,
        nodeCache,
        pointBudget,
        accepted,
        running,
        processedBlocks,
        parentKey,
    } = ctx;

    let points = running;
    if (
        parentNode &&
        !accepted.has(parentKey) &&
        points + parentNode.pointCount <= pointBudget
    ) {
        accepted.add(parentKey);
        points += parentNode.pointCount;
    }

    const sortedSiblings = [...blockCandidates].sort(
        (a, b) => b.priority - a.priority,
    );
    let added = 0;
    for (const bc of sortedSiblings) {
        const bcNode = nodeCache.get(bc.key);
        if (!bcNode) continue;
        if (points + bcNode.pointCount <= pointBudget) {
            accepted.add(bc.key);
            points += bcNode.pointCount;
            added += bcNode.pointCount;
        }
    }
    processedBlocks.add(parentKey);
    return added;
}

/**
 * Greedy budget fill: sort candidates by priority DESC, accept until budget
 * exhausted. Handles parent-fallback block reservation and single-node fallback.
 */
export function computeBudgetPlan(
    candidates: CandidateNode[],
    nodeCache: ReadonlyMap<string, CachedNode>,
    pointBudget: number,
    fallbacks: ReadonlyMap<string, string>,
): BudgetPlan {
    const sorted = [...candidates].sort((a, b) => b.priority - a.priority);

    const { occupied, acceptedKeys: accepted } =
        computeOccupiedBudget(nodeCache);
    let runningPointCount = occupied;

    const parentToChildren = buildParentChildMap(fallbacks);
    const processedBlocks = new Set<string>();

    const ctx: BlockProcessContext = {
        parentKey: "", // set per-iteration below
        parentToChildren,
        sorted,
        nodeCache,
        pointBudget,
        accepted,
        processedBlocks,
    };

    for (const candidate of sorted) {
        const node = nodeCache.get(candidate.key);
        if (!node) continue;

        const parentKey = fallbacks.get(candidate.key);

        if (parentKey) {
            ctx.parentKey = parentKey;
            runningPointCount += processBlockCandidate(
                candidate,
                ctx,
                runningPointCount,
            );
            continue;
        }

        if (runningPointCount + node.pointCount <= pointBudget) {
            accepted.add(candidate.key);
            runningPointCount += node.pointCount;
        }
    }

    const toLoad: string[] = [];
    for (const key of accepted) {
        const n = nodeCache.get(key);
        if (!n || n.state === "loaded" || n.state === "loading") continue;
        toLoad.push(key);
    }

    const toLoadPoints = toLoad.reduce((sum, key) => {
        const n = nodeCache.get(key);
        return sum + (n?.pointCount ?? 0);
    }, 0);
    const deficit = Math.max(0, runningPointCount + toLoadPoints - pointBudget);

    return {
        accepted: [...accepted],
        toLoad,
        deficit,
    };
}
