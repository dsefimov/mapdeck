import { describe, expect, it, vi } from "vitest";
import { cascadeVisibility } from "./cascadeVisibility";
import { layerNode, groupNode } from "../structure/__testFactories";
import type { TreeState } from "../../types";
import { isGroupNode, type TreeNode } from "@core/contracts";

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

describe("cascadeVisibility", () => {
    it("showing loads unloaded groups via loadChildren and returns all reachable ids", async () => {
        const inner = groupNode("G2", ["L2"]);
        const root = groupNode("G", ["G2", "L1"]);
        const state = makeState({
            G: root,
            G2: inner,
            L1: layerNode("L1"),
            L2: layerNode("L2"),
        });
        const loadChildren = vi.fn(async () => {});

        const ids = await cascadeVisibility(state, ["G"], true, {
            loadChildren,
        });

        expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual([
            "G",
            "G2",
            "L1",
            "L2",
        ]);
        expect(loadChildren).toHaveBeenCalledTimes(2);
        expect(loadChildren).toHaveBeenCalledWith("G", undefined);
        expect(loadChildren).toHaveBeenCalledWith("G2", undefined);
    });

    it("hiding traverses loaded descendants only without loading", async () => {
        const inner = groupNode("G2", ["L2"]);
        const root = groupNode("G", ["G2", "L1"]);
        const state = makeState({
            G: root,
            G2: inner,
            L1: layerNode("L1"),
            L2: layerNode("L2"),
        });
        const loadChildren = vi.fn(async () => {});

        const ids = await cascadeVisibility(state, ["G"], false, {
            loadChildren,
        });

        expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual([
            "G",
            "G2",
            "L1",
            "L2",
        ]);
        expect(loadChildren).not.toHaveBeenCalled();
    });

    it("hiding an unloaded group returns only the group itself", async () => {
        const state = makeState({ G: groupNode("G", []) });
        const loadChildren = vi.fn();

        const ids = await cascadeVisibility(state, ["G"], false, {
            loadChildren,
        });

        expect([...ids]).toEqual(["G"]);
        expect(loadChildren).not.toHaveBeenCalled();
    });

    it("aborting the signal stops traversal before descendants are visited", async () => {
        const controller = new AbortController();
        const root = groupNode("G", ["L1"]);
        const state = makeState({ G: root, L1: layerNode("L1") });
        const loadChildren = vi.fn(async (_id: string, sig?: AbortSignal) => {
            sig?.addEventListener("abort", () => undefined);
            controller.abort();
        });

        const ids = await cascadeVisibility(state, ["G"], true, {
            loadChildren,
            signal: controller.signal,
        });

        expect([...ids]).toEqual(["G"]);
        expect(loadChildren).toHaveBeenCalledTimes(1);
    });
});
