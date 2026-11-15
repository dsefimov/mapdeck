import { describe, expect, it, vi } from "vitest";
import { searchTree } from "./searchTree";
import { layerNode, groupNode } from "../structure/__testFactories";
import type { TreeState } from "../../types";
import { isGroupNode, type TreeNode } from "@core/contracts";

interface NodeMap {
    nodes: Record<string, TreeNode>;
    state: TreeState;
}

function makeTree(nodes: Record<string, TreeNode>): NodeMap {
    // Wire parentId from group children for ancestor-free traversal.
    for (const node of Object.values(nodes)) {
        if (isGroupNode(node)) {
            for (const childId of node.childrenIds) {
                const child = nodes[childId];
                if (child) child.parentId = node.id;
            }
        }
    }
    return {
        nodes,
        state: {
            getNode: (id) => nodes[id],
            childrenOf: (parentId) => {
                const node = nodes[parentId];
                return node && isGroupNode(node) ? node.childrenIds : [];
            },
            rootIds: [],
        },
    };
}

describe("searchTree", () => {
    it("matches by title", async () => {
        const { state } = makeTree({
            L: layerNode("L", { title: "Orthophoto" }),
        });
        const loadChildren = vi.fn(async () => {});

        const ids = await searchTree(state, ["L"], "ortho", { loadChildren });

        expect([...ids]).toEqual(["L"]);
        expect(loadChildren).not.toHaveBeenCalled();
    });

    it("matches by description, normalizing the query", async () => {
        const { state } = makeTree({
            L: layerNode("L", {
                title: "Layer",
                description: "Elevation data",
            }),
        });
        const loadChildren = vi.fn(async () => {});

        const ids = await searchTree(state, ["L"], "  ELEVATION  ", {
            loadChildren,
        });

        expect([...ids]).toEqual(["L"]);
    });

    it("still loads an unloaded subtree even when nothing matches", async () => {
        const inner = groupNode("G2", []);
        const { state, nodes } = makeTree({
            G: groupNode("G", ["G2"]),
            G2: inner,
        });
        const loadChildren = vi.fn(async (id: string) => {
            if (id === "G2") {
                // Children arrive as a fresh batch — the store replaces the node.
                nodes["G2"] = groupNode("G2", ["L"]);
            }
        });

        const ids = await searchTree(state, ["G"], "matched", { loadChildren });

        expect(loadChildren).toHaveBeenCalledWith("G", undefined);
        expect(loadChildren).toHaveBeenCalledWith("G2", undefined);
        expect(nodes["G2"]).not.toBe(inner);
        expect([...ids]).toEqual([]);
    });

    it("returns a deep match found after lazy loading", async () => {
        const inner = groupNode("G2", []);
        const { state, nodes } = makeTree({
            G: groupNode("G", ["G2"]),
            G2: inner,
            L: layerNode("L", { title: "Orthophoto" }),
        });
        const loadChildren = vi.fn(async (id: string) => {
            if (id === "G2") {
                nodes["G2"] = groupNode("G2", ["L"]);
            }
        });

        const ids = await searchTree(state, ["G"], "ortho", { loadChildren });

        expect([...ids]).toEqual(["L"]);
    });

    it("returns an empty set for an empty or whitespace query without loading", async () => {
        const { state } = makeTree({ G: groupNode("G", []) });
        const loadChildren = vi.fn(async () => {});

        const ids = await searchTree(state, ["G"], "   ", { loadChildren });

        expect([...ids]).toEqual([]);
        expect(loadChildren).not.toHaveBeenCalled();
    });

    it("aborting the signal stops traversal before children are visited", async () => {
        const controller = new AbortController();
        const { state } = makeTree({
            G: groupNode("G", ["L1"]),
            L1: layerNode("L1"),
        });
        const loadChildren = vi.fn(async () => {
            controller.abort();
        });

        const ids = await searchTree(state, ["G"], "query", {
            loadChildren,
            signal: controller.signal,
        });

        expect(loadChildren).toHaveBeenCalledTimes(1);
        expect([...ids]).toEqual([]);
    });

    it("does not mutate the tree state", async () => {
        const root = groupNode("G", ["L1"]);
        const leaf = layerNode("L1", { title: "Orthophoto" });
        const { state } = makeTree({ G: root, L1: leaf });
        const loadChildren = vi.fn(async () => {});

        await searchTree(state, ["G"], "ortho", { loadChildren });

        expect(state.getNode("G")).toBe(root);
        expect(state.getNode("L1")).toBe(leaf);
        expect(leaf.title).toBe("Orthophoto");
    });

    it("returns matched ids only, not ancestors", async () => {
        const { state } = makeTree({
            G: groupNode("G", ["L1"]),
            L1: layerNode("L1", { title: "Orthophoto" }),
        });
        const loadChildren = vi.fn(async () => {});

        const ids = await searchTree(state, ["G"], "ortho", { loadChildren });

        expect([...ids]).toEqual(["L1"]);
    });
});
