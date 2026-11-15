import { describe, expect, it } from "vitest";
import type { CachedNode, NodeState } from "../../types";
import { cachedNode } from "../__testFactories";
import { computeOccupiedBudget } from "./computeOccupiedBudget";

const KEY = "1-0-0-0";
const OTHER_KEY = "1-1-1-1";

const NODE_POINTS = 100;

function inState(key: string, state: NodeState): CachedNode {
    return cachedNode(key, { state, pointCount: NODE_POINTS });
}

function cacheOf(...nodes: CachedNode[]): Map<string, CachedNode> {
    return new Map(nodes.map((node) => [node.key, node]));
}

describe("computeOccupiedBudget", () => {
    it.each<[NodeState]>([["loaded"], ["loading"]])(
        "counts a %s node, which is holding its slot either way",
        (state) => {
            const result = computeOccupiedBudget(cacheOf(inState(KEY, state)));

            expect(result.occupied).toBe(NODE_POINTS);
            expect([...result.acceptedKeys]).toEqual([KEY]);
        },
    );

    it.each<[NodeState]>([["pending"], ["error"]])(
        "ignores a %s node, which holds no points yet",
        (state) => {
            const result = computeOccupiedBudget(cacheOf(inState(KEY, state)));

            expect(result.occupied).toBe(0);
            expect([...result.acceptedKeys]).toEqual([]);
        },
    );

    it("sums every node that occupies a slot", () => {
        const result = computeOccupiedBudget(
            cacheOf(
                inState(KEY, "loaded"),
                inState(OTHER_KEY, "loading"),
                inState("2-0-0-0", "pending"),
            ),
        );

        expect(result.occupied).toBe(NODE_POINTS * 2);
    });

    it("reports an empty cache as occupying nothing", () => {
        const result = computeOccupiedBudget(new Map());

        expect(result.occupied).toBe(0);
        expect(result.acceptedKeys.size).toBe(0);
    });
});
