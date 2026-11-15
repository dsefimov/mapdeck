/**
 * Budget planning for point-cloud streaming.
 * Thin orchestrator: occupy → build parent/child → atomic blocks → greedy fill.
 */

import type {
    CachedNode,
    BudgetPlan,
    CandidateNode,
} from "../../types";
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
    sortedByKey: Map<string, CandidateNode>;
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
        sortedByKey,
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
        const sc = sortedByKey.get(sk);
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

/**
 * Greedily accept children within remaining budget when block doesn't fit.
 *
 * Returns everything this call consumed, the fallback parent included — the
 * caller folds it into its running total, and the atomic path it mirrors
 * (`reserveSiblingBlock`) counts the parent the same way.
 */
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
        (a, b) => a.priority - b.priority,
    );
    for (const bc of sortedSiblings) {
        if (accepted.has(bc.key)) continue;
        const bcNode = nodeCache.get(bc.key);
        if (!bcNode) continue;
        if (points + bcNode.pointCount <= pointBudget) {
            accepted.add(bc.key);
            points += bcNode.pointCount;
        }
    }
    processedBlocks.add(parentKey);
    return points - running;
}

/**
 * Greedy budget fill: take candidates in ascending priority — `updatePriority`
 * ranks the most urgent tile lowest — and accept until the budget is exhausted,
 * so a tight budget is spent on what the viewer is actually looking at.
 * Handles parent-fallback block reservation and single-node fallback.
 */
export function computeBudgetPlan(
    candidates: CandidateNode[],
    nodeCache: ReadonlyMap<string, CachedNode>,
    pointBudget: number,
    fallbacks: ReadonlyMap<string, string>,
): BudgetPlan {
    const sorted = [...candidates].sort((a, b) => a.priority - b.priority);
    // O(1) sibling lookups: the block path resolves every sibling key
    // against the candidate list, a find() per key made it quadratic.
    const sortedByKey = new Map(sorted.map((c) => [c.key, c]));

    const { occupied, acceptedKeys: accepted } =
        computeOccupiedBudget(nodeCache);
    let runningPointCount = occupied;

    const parentToChildren = buildParentChildMap(fallbacks);
    const processedBlocks = new Set<string>();

    const ctx: BlockProcessContext = {
        parentKey: "", // set per-iteration below
        parentToChildren,
        sortedByKey,
        nodeCache,
        pointBudget,
        accepted,
        processedBlocks,
    };

    for (const candidate of sorted) {
        const node = nodeCache.get(candidate.key);
        if (!node) continue;
        // Loaded/loading candidates are already in `accepted` with their points
        // counted by computeOccupiedBudget — accepting them again would double
        // the occupancy and stall new loads at half the budget.
        if (accepted.has(candidate.key)) continue;

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

    // `runningPointCount` already carries every accepted node's points exactly
    // once — toLoad is a subset of accepted, so deficit must not add it again.
    const deficit = Math.max(0, runningPointCount - pointBudget);

    return {
        accepted: [...accepted],
        toLoad,
        deficit,
    };
}
