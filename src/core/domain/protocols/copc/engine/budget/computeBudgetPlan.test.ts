import { describe, expect, it } from "vitest";
import type {
    CachedNode,
    CandidateNode,
} from "../../types";
import { cachedNode } from "../__testFactories";
import { computeBudgetPlan } from "./computeBudgetPlan";

const PARENT = "0-0-0-0";
const URGENT = "1-0-0-0";
const MIDDLE = "1-1-0-0";
const SLACK = "1-1-1-1";

const NO_FALLBACKS: ReadonlyMap<string, string> = new Map();

/** Every node the same size, so only the rank can decide who gets the budget. */
const NODE_POINTS = 100;

function pending(key: string): CachedNode {
    return cachedNode(key, { state: "pending", pointCount: NODE_POINTS });
}

function candidate(key: string, priority: number): CandidateNode {
    return { key, screenError: 1, priority, distanceToCamera: 1 };
}

function cacheOf(...nodes: CachedNode[]): Map<string, CachedNode> {
    return new Map(nodes.map((node) => [node.key, node]));
}

describe("computeBudgetPlan", () => {
    it("spends a budget too small for everyone on the most urgent candidates", () => {
        const cache = cacheOf(pending(URGENT), pending(MIDDLE), pending(SLACK));

        const plan = computeBudgetPlan(
            [candidate(SLACK, 30), candidate(URGENT, 10), candidate(MIDDLE, 20)],
            cache,
            NODE_POINTS * 2.5,
            NO_FALLBACKS,
        );

        expect(plan.toLoad).toEqual([URGENT, MIDDLE]);
    });

    it("keeps the most urgent children when a sibling block does not fit whole", () => {
        const cache = cacheOf(pending(PARENT), pending(URGENT), pending(SLACK));
        const fallbacks = new Map([
            [URGENT, PARENT],
            [SLACK, PARENT],
        ]);

        const plan = computeBudgetPlan(
            [candidate(SLACK, 30), candidate(URGENT, 10)],
            cache,
            NODE_POINTS * 2.5,
            fallbacks,
        );

        expect(plan.toLoad).toEqual([PARENT, URGENT]);
    });

    it("never accepts more points than the budget allows", () => {
        const budget = NODE_POINTS * 2.5;
        const cache = cacheOf(
            pending(PARENT),
            pending(URGENT),
            pending(SLACK),
            pending(MIDDLE),
        );
        const fallbacks = new Map([
            [URGENT, PARENT],
            [SLACK, PARENT],
        ]);

        const plan = computeBudgetPlan(
            [candidate(URGENT, 10), candidate(MIDDLE, 20), candidate(SLACK, 30)],
            cache,
            budget,
            fallbacks,
        );
        const spent = plan.accepted.reduce(
            (sum, key) => sum + (cache.get(key)?.pointCount ?? 0),
            0,
        );

        expect(spent).toBeLessThanOrEqual(budget);
    });

    it("drops nobody when the budget is ample", () => {
        const cache = cacheOf(pending(URGENT), pending(MIDDLE), pending(SLACK));

        const plan = computeBudgetPlan(
            [candidate(SLACK, 30), candidate(URGENT, 10), candidate(MIDDLE, 20)],
            cache,
            NODE_POINTS * 10,
            NO_FALLBACKS,
        );

        expect(new Set(plan.toLoad)).toEqual(
            new Set([URGENT, MIDDLE, SLACK]),
        );
    });

    it("counts a loaded node as already occupying its share of the budget", () => {
        const cache = cacheOf(
            cachedNode(SLACK, { pointCount: NODE_POINTS }),
            pending(URGENT),
        );

        const plan = computeBudgetPlan(
            [candidate(URGENT, 10)],
            cache,
            NODE_POINTS * 1.5,
            NO_FALLBACKS,
        );

        expect(plan.toLoad).toEqual([]);
    });

    it("spends nothing on a loaded candidate — its share is counted once", () => {
        const cache = cacheOf(
            cachedNode(SLACK, { pointCount: NODE_POINTS }),
            pending(URGENT),
        );

        const plan = computeBudgetPlan(
            [candidate(SLACK, 30), candidate(URGENT, 10)],
            cache,
            NODE_POINTS * 2,
            NO_FALLBACKS,
        );

        expect(plan.toLoad).toEqual([URGENT]);
    });

    it("gives a sibling slot to an unloaded node when a loaded sibling is already accepted", () => {
        const THIRD = "1-0-1-0";
        const cache = cacheOf(
            pending(PARENT),
            pending(URGENT),
            cachedNode(SLACK, { pointCount: NODE_POINTS }),
            pending(THIRD),
        );
        const fallbacks = new Map([
            [URGENT, PARENT],
            [SLACK, PARENT],
            [THIRD, PARENT],
        ]);

        const plan = computeBudgetPlan(
            [candidate(SLACK, 5), candidate(URGENT, 10), candidate(THIRD, 20)],
            cache,
            NODE_POINTS * 3,
            fallbacks,
        );

        expect(plan.toLoad).toEqual([PARENT, URGENT]);
    });

    it("reports no deficit when the plan fits inside the budget", () => {
        const cache = cacheOf(pending(URGENT));

        const plan = computeBudgetPlan(
            [candidate(URGENT, 10)],
            cache,
            NODE_POINTS * 1.5,
            NO_FALLBACKS,
        );

        expect(plan.deficit).toBe(0);
    });

    it("counts an over-committed cache's loaded points once in the deficit", () => {
        const cache = cacheOf(
            cachedNode(SLACK, { pointCount: NODE_POINTS }),
        );

        const plan = computeBudgetPlan(
            [candidate(SLACK, 30)],
            cache,
            NODE_POINTS * 0.6,
            NO_FALLBACKS,
        );

        expect(plan.deficit).toBe(NODE_POINTS * 0.4);
    });
});
