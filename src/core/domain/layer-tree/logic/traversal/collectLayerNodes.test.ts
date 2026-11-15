import { describe, expect, it } from "vitest";
import { collectLayerNodes } from "./collectLayerNodes";
import { groupNode, layerNode } from "../structure/__testFactories";
import type { TreeNode, GroupNode } from "@core/contracts";
import type { TreeState } from "../../types";

function makeState(
    nodes: Record<string, TreeNode>,
    rootIds: string[] = [],
): TreeState {
    return {
        getNode: (id: string) => nodes[id],
        childrenOf: (parentId) => {
            const node = nodes[parentId];
            return node && node.type === "GROUP"
                ? (node as GroupNode).childrenIds
                : [];
        },
        rootIds,
    };
}

describe("collectLayerNodes", () => {
    it("returns empty array for empty rootIds", () => {
        const state = makeState({}, []);
        expect(collectLayerNodes(state)).toEqual([]);
    });

    it("collects a single leaf node", () => {
        const leaf = layerNode("leaf");
        const state = makeState({ leaf }, ["leaf"]);
        const result = collectLayerNodes(state);
        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe("leaf");
    });

    it("returns empty when root node not found", () => {
        const state = makeState({}, ["missing"]);
        expect(collectLayerNodes(state)).toEqual([]);
    });

    it("skips group nodes, collects only leaf nodes", () => {
        const group = groupNode("G", ["L1", "L2"]);
        const l1 = layerNode("L1");
        const l2 = layerNode("L2");
        const state = makeState({ G: group, L1: l1, L2: l2 }, ["G"]);
        const result = collectLayerNodes(state);
        expect(result.map((n) => n.id)).toEqual(["L1", "L2"]);
    });

    it("traverses deeply nested groups to find leaves", () => {
        const root = groupNode("R", ["G1"]);
        const g1 = groupNode("G1", ["L1", "G2"]);
        const g2 = groupNode("G2", ["L2"]);
        const l1 = layerNode("L1");
        const l2 = layerNode("L2");
        const state = makeState({ R: root, G1: g1, G2: g2, L1: l1, L2: l2 }, [
            "R",
        ]);
        const result = collectLayerNodes(state);
        expect(result.map((n) => n.id)).toEqual(["L1", "L2"]);
    });

    it("preserves original order via reverse stack push", () => {
        const root = groupNode("R", ["C", "B", "A"]);
        const a = layerNode("A");
        const b = layerNode("B");
        const c = layerNode("C");
        const state = makeState({ R: root, A: a, B: b, C: c }, ["R"]);
        const result = collectLayerNodes(state);
        expect(result.map((n) => n.id)).toEqual(["C", "B", "A"]);
    });

    it("collects from multiple root ids (LIFO stack order)", () => {
        const a = layerNode("A");
        const b = layerNode("B");
        const state = makeState({ A: a, B: b }, ["A", "B"]);
        const result = collectLayerNodes(state);
        // Stack is LIFO: ["A","B"] → pop B first, then A → ["B","A"]
        expect(result.map((n) => n.id)).toEqual(["B", "A"]);
    });
});
