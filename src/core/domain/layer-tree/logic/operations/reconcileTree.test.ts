import { describe, expect, it } from "vitest";
import { isGroupNode, type TreeNode } from "@core/contracts";
import type { TreeState } from "../../types";
import { reconcileTree } from "./reconcileTree";
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

describe("reconcileTree", () => {
    it("removes nothing when the tree is empty", () => {
        const state = makeState({}, []);
        const result = reconcileTree({
            state,
            parentId: null,
            incomingNodes: [layerNode("a"), layerNode("b")],
        });
        expect(result.removed).toEqual([]);
    });

    it("removes nothing when every existing id is present in incoming", () => {
        const state = makeState({ a: layerNode("a") }, ["a"]);
        const result = reconcileTree({
            state,
            parentId: null,
            incomingNodes: [layerNode("a"), layerNode("b")],
        });
        expect(result.removed).toEqual([]);
    });

    it("removes existing root nodes missing from incoming", () => {
        const state = makeState({ a: layerNode("a"), b: layerNode("b") }, [
            "a",
            "b",
        ]);
        const result = reconcileTree({
            state,
            parentId: null,
            incomingNodes: [layerNode("a")],
        });
        expect(result.removed).toEqual(["b"]);
    });

    it("removes whole subtrees of stale nodes", () => {
        const group = groupNode("g", ["child"]);
        const state = makeState({ g: group, child: layerNode("child") }, ["g"]);
        const result = reconcileTree({
            state,
            parentId: null,
            incomingNodes: [],
        });
        expect(result.removed).toEqual(["g", "child"]);
    });

    it("removes everything when incoming is empty", () => {
        const state = makeState(
            { a: layerNode("a"), g: groupNode("g", ["b"]), b: layerNode("b") },
            ["a", "g"],
        );
        const result = reconcileTree({
            state,
            parentId: null,
            incomingNodes: [],
        });
        expect(result.removed).toEqual(["a", "g", "b"]);
    });

    it("reconciles a subtree against childrenOf(parentId)", () => {
        const child = layerNode("c1");
        const group = groupNode("g", ["c1", "c2"]);
        const c2 = layerNode("c2");
        const state = makeState({ g: group, c1: child, c2 }, ["g"]);
        const result = reconcileTree({
            state,
            parentId: "g",
            incomingNodes: [layerNode("c1"), layerNode("c3")],
        });
        expect(result.removed).toEqual(["c2"]);
    });

    it("ignores rootIds when reconciling a subtree", () => {
        const group = groupNode("g", ["child"]);
        const state = makeState(
            { g: group, child: layerNode("child"), root: layerNode("root") },
            ["root"],
        );
        const result = reconcileTree({
            state,
            parentId: "g",
            incomingNodes: [layerNode("child")],
        });
        expect(result.removed).toEqual([]);
    });

    it("does not mutate the state", () => {
        const node = layerNode("a");
        const state = makeState({ a: node }, ["a"]);
        const incoming = [layerNode("a"), layerNode("b")];
        reconcileTree({ state, parentId: null, incomingNodes: incoming });
        expect(state.rootIds).toEqual(["a"]);
        expect(state.getNode("a")).toBe(node);
    });
});
