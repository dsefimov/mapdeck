import { describe, expect, it } from "vitest";
import { collectSubtreeIds } from "./collectSubtreeIds";
import { groupNode, layerNode } from "../structure/__testFactories";
import type { TreeNode } from "@core/contracts";

/** Creates a lookup function from a Map for use as `getNode` callback. */
function makeLookup(
    nodes: Record<string, TreeNode>,
): (id: string) => TreeNode | undefined {
    return (id: string) => nodes[id];
}

describe("collectSubtreeIds", () => {
    it("returns [nodeId] when node is not found", () => {
        const getNode = () => undefined;
        expect(collectSubtreeIds("missing", getNode)).toEqual(["missing"]);
    });

    it("returns [nodeId] for a leaf node (LayerNode)", () => {
        const node = layerNode("leaf");
        const getNode = makeLookup({ leaf: node });
        expect(collectSubtreeIds("leaf", getNode)).toEqual(["leaf"]);
    });

    it("returns [nodeId] for a group with no children", () => {
        const node = groupNode("empty", []);
        const getNode = makeLookup({ empty: node });
        expect(collectSubtreeIds("empty", getNode)).toEqual(["empty"]);
    });

    it("collects a group with a single child", () => {
        const parent = groupNode("A", ["B"]);
        const child = layerNode("B");
        const getNode = makeLookup({ A: parent, B: child });
        expect(collectSubtreeIds("A", getNode)).toEqual(["A", "B"]);
    });

    it("collects a group with multiple children", () => {
        const parent = groupNode("A", ["B", "C"]);
        const b = layerNode("B");
        const c = layerNode("C");
        const getNode = makeLookup({ A: parent, B: b, C: c });
        expect(collectSubtreeIds("A", getNode)).toEqual(["A", "B", "C"]);
    });

    it("collects deeply nested tree (DFS order)", () => {
        // A → B → C (leaf), A → D (leaf)
        const a = groupNode("A", ["B", "D"]);
        const b = groupNode("B", ["C"]);
        const c = layerNode("C");
        const d = layerNode("D");
        const getNode = makeLookup({ A: a, B: b, C: c, D: d });
        expect(collectSubtreeIds("A", getNode)).toEqual(["A", "B", "C", "D"]);
    });

    it("handles missing child node gracefully", () => {
        const parent = groupNode("A", ["B"]);
        const getNode = makeLookup({ A: parent }); // B is missing
        expect(collectSubtreeIds("A", getNode)).toEqual(["A", "B"]);
    });

    it("handles wider tree with mixed depth", () => {
        //        A
        //      / | \
        //     B  C  D
        //    / \     \
        //   E   F     G
        const a = groupNode("A", ["B", "C", "D"]);
        const b = groupNode("B", ["E", "F"]);
        const c = layerNode("C");
        const d = groupNode("D", ["G"]);
        const e = layerNode("E");
        const f = layerNode("F");
        const g = layerNode("G");
        const getNode = makeLookup({
            A: a,
            B: b,
            C: c,
            D: d,
            E: e,
            F: f,
            G: g,
        });
        expect(collectSubtreeIds("A", getNode)).toEqual([
            "A",
            "B",
            "E",
            "F",
            "C",
            "D",
            "G",
        ]);
    });
});
