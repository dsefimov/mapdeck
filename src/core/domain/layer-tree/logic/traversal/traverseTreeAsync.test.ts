import { describe, expect, it, vi } from "vitest";
import { isGroupNode, type TreeNode } from "@core/contracts";
import type { TreeState } from "../../types";
import { traverseTreeAsync } from "./traverseTreeAsync";
import { groupNode, layerNode } from "../structure/__testFactories";

/**
 * Builds a TreeState from a flat node map and root ids.
 */
function makeState(
    nodes: Record<string, TreeNode>,
    rootIds: string[],
): TreeState {
    return {
        rootIds,
        getNode: (id) => nodes[id],
        childrenOf: (parentId) => {
            const node = nodes[parentId];
            return node && isGroupNode(node) ? node.childrenIds : [];
        },
    };
}

const isLayer = (node: TreeNode) => !isGroupNode(node);

/** A → [B → [C]], all layers below the root group. */
function makeNestedState(): {
    state: TreeState;
    nodes: Record<string, TreeNode>;
} {
    const a = groupNode("A", ["B"]);
    const b = groupNode("B", ["C"]);
    const c = layerNode("C");
    const nodes = { A: a, B: b, C: c };
    return { state: makeState(nodes, ["A"]), nodes };
}

describe("traverseTreeAsync", () => {
    it("collects all visited nodes with a true predicate", async () => {
        const { state } = makeNestedState();
        const result = await traverseTreeAsync(state, ["A"], async () => {}, {
            predicate: () => true,
        });
        expect([...result.matchedIds]).toEqual(["A", "B", "C"]);
    });

    it("filters nodes by the predicate", async () => {
        const { state } = makeNestedState();
        const result = await traverseTreeAsync(state, ["A"], async () => {}, {
            predicate: isLayer,
        });
        expect([...result.matchedIds]).toEqual(["C"]);
    });

    it("traverses from multiple start ids", async () => {
        const { nodes } = makeNestedState();
        const leaf = layerNode("D");
        const state2 = makeState({ ...nodes, D: leaf }, ["A", "D"]);
        const result = await traverseTreeAsync(
            state2,
            ["A", "D"],
            async () => {},
            { predicate: () => true },
        );
        expect([...result.matchedIds]).toEqual(["A", "B", "C", "D"]);
    });

    it("skips missing start ids", async () => {
        const { state } = makeNestedState();
        const result = await traverseTreeAsync(
            state,
            ["missing"],
            async () => {},
            { predicate: () => true },
        );
        expect([...result.matchedIds]).toEqual([]);
    });

    it("calls refresh for each group when loadUnloaded is set", async () => {
        const { state } = makeNestedState();
        const refresh = vi.fn(async (_id: string) => {});
        await traverseTreeAsync(state, ["A"], refresh, {
            predicate: () => true,
            loadUnloaded: true,
        });
        expect(refresh).toHaveBeenCalledTimes(2);
        expect(refresh.mock.calls.map(([id]) => id)).toEqual(["A", "B"]);
    });

    it("does not call refresh without loadUnloaded", async () => {
        const { state } = makeNestedState();
        const refresh = vi.fn(async (_id: string) => {});
        await traverseTreeAsync(state, ["A"], refresh, {
            predicate: () => true,
        });
        expect(refresh).not.toHaveBeenCalled();
    });

    it("passes the abort signal to refresh", async () => {
        const { state } = makeNestedState();
        const controller = new AbortController();
        const refresh = vi.fn(async (_id: string, _signal?: AbortSignal) => {});
        await traverseTreeAsync(state, ["A"], refresh, {
            predicate: () => true,
            loadUnloaded: true,
            signal: controller.signal,
        });
        expect(refresh.mock.calls[0]![1]).toBe(controller.signal);
    });

    it("stops traversal when the signal is already aborted", async () => {
        const { state } = makeNestedState();
        const controller = new AbortController();
        controller.abort();
        const result = await traverseTreeAsync(state, ["A"], async () => {}, {
            predicate: () => true,
            signal: controller.signal,
        });
        expect([...result.matchedIds]).toEqual([]);
    });

    it("aborts mid-traversal during refresh", async () => {
        const { state } = makeNestedState();
        const controller = new AbortController();
        const refresh = vi.fn(async (id: string) => {
            if (id === "B") controller.abort();
        });
        const result = await traverseTreeAsync(state, ["A"], refresh, {
            predicate: () => true,
            loadUnloaded: true,
            signal: controller.signal,
        });
        // A and B were visited before the abort; C was not.
        expect([...result.matchedIds]).toEqual(["A", "B"]);
    });
});
