import { describe, expect, it } from "vitest";
import { resolveNodes } from "./resolveNodes";
import { layerNode, groupNode } from "../structure/__testFactories";
import type { TreeState } from "../../types";

function makeState(
    ids: Record<string, ReturnType<typeof layerNode> | ReturnType<typeof groupNode>>,
): TreeState {
    return {
        getNode: (id) => ids[id],
        childrenOf: () => [],
        rootIds: [],
    };
}

describe("resolveNodes", () => {
    it("returns empty array for empty ids", () => {
        const a = layerNode("A");
        const state = makeState({ A: a });
        expect(resolveNodes(state, [])).toEqual([]);
    });

    it("resolves all IDs when all found", () => {
        const a = layerNode("A");
        const b = groupNode("B", ["C"]);
        const state = makeState({ A: a, B: b });
        const result = resolveNodes(state, ["A", "B"]);
        expect(result).toHaveLength(2);
        expect(result[0]?.id).toBe("A");
        expect(result[1]?.id).toBe("B");
    });

    it("omits IDs not found in tree", () => {
        const a = layerNode("A");
        const state = makeState({ A: a });
        expect(resolveNodes(state, ["A", "missing"])).toEqual([a]);
    });

    it("preserves input order", () => {
        const a = layerNode("A");
        const b = layerNode("B");
        const c = layerNode("C");
        const state = makeState({ A: a, B: b, C: c });
        const result = resolveNodes(state, ["C", "A", "B"]);
        expect(result.map((n) => n.id)).toEqual(["C", "A", "B"]);
    });
});
