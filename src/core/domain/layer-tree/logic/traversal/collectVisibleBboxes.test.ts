import { describe, expect, it } from "vitest";
import { collectVisibleBboxes } from "./collectVisibleBboxes";
import { layerNode, groupNode } from "../structure/__testFactories";
import { Bbox } from "@core/lib/geo";
import type { TreeState } from "../../types";
import {
    isGroupNode,
    type TreeNode,
    type LayerNode,
} from "@core/contracts";

const BBOX = new Bbox([0, 0, 1, 1]);

function makeState(nodes: Record<string, TreeNode>): TreeState {
    return {
        getNode: (id) => nodes[id],
        childrenOf: (parentId) => {
            const node = nodes[parentId];
            return node && isGroupNode(node) ? node.childrenIds : [];
        },
        rootIds: [],
    };
}

function visibleLayer(id: string): LayerNode {
    const ln = layerNode(id);
    ln.isVisible = true;
    ln.bbox = BBOX;
    return ln;
}

describe("collectVisibleBboxes", () => {
    it("returns empty array for missing node", () => {
        const state = makeState({});
        expect(collectVisibleBboxes(state, "missing")).toEqual([]);
    });

    it("collects bbox from a single visible layer", () => {
        const leaf = visibleLayer("L");
        const state = makeState({ L: leaf });
        expect(collectVisibleBboxes(state, "L")).toEqual([BBOX]);
    });

    it("skips invisible layer", () => {
        const leaf = layerNode("L");
        leaf.isVisible = false;
        leaf.bbox = BBOX;
        const state = makeState({ L: leaf });
        expect(collectVisibleBboxes(state, "L")).toEqual([]);
    });

    it("skips visible layer without bbox", () => {
        const leaf = layerNode("L");
        leaf.isVisible = true;
        leaf.bbox = null;
        const state = makeState({ L: leaf });
        expect(collectVisibleBboxes(state, "L")).toEqual([]);
    });

    it("traverses group to collect visible layer bboxes", () => {
        const l1 = visibleLayer("L1");
        const l2 = visibleLayer("L2");
        const group = groupNode("G", ["L1", "L2"]);
        const state = makeState({ G: group, L1: l1, L2: l2 });
        expect(collectVisibleBboxes(state, "G")).toEqual([BBOX, BBOX]);
    });

    it("skips invisible children in group", () => {
        const visible = visibleLayer("L1");
        const hidden = layerNode("L2");
        hidden.isVisible = false;
        hidden.bbox = BBOX;
        const group = groupNode("G", ["L1", "L2"]);
        const state = makeState({ G: group, L1: visible, L2: hidden });
        expect(collectVisibleBboxes(state, "G")).toEqual([BBOX]);
    });
});
