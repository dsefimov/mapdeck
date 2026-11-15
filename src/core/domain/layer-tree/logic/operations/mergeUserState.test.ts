import { describe, expect, it } from "vitest";
import { mergeUserState } from "./mergeUserState";
import { layerNode, groupNode } from "../structure/__testFactories";
import { isLayerNode } from "@core/contracts";

describe("mergeUserState", () => {
    it("keeps isVisible from the old node", () => {
        const oldNode = layerNode("1", { isVisible: true });
        const incoming = layerNode("1", { isVisible: false, title: "New" });
        const merged = mergeUserState(oldNode, incoming);
        expect(merged.isVisible).toBe(true);
        expect(merged.title).toBe("New");
    });

    it("keeps the style override from the old node", () => {
        const oldNode = layerNode("1", {
            style: { paint: { "raster-opacity": 0.5 } },
        });
        const incoming = layerNode("1", {
            style: { paint: { "raster-opacity": 1 } },
        });
        const merged = mergeUserState(oldNode, incoming);
        expect(isLayerNode(merged)).toBe(true);
        expect((merged as { style?: unknown }).style).toEqual({
            paint: { "raster-opacity": 0.5 },
        });
    });

    it("lets the incoming style win when the old node has none", () => {
        const oldNode = layerNode("1");
        delete oldNode.style;
        const incoming = layerNode("1", {
            style: { paint: { "raster-opacity": 0.3 } },
        });
        const merged = mergeUserState(oldNode, incoming);
        expect((merged as { style?: unknown }).style).toEqual({
            paint: { "raster-opacity": 0.3 },
        });
    });

    it("updates structural fields from the incoming node", () => {
        const oldNode = groupNode("g1", ["a"], { isVisible: true });
        const incoming = groupNode("g1", ["a", "b"], {
            title: "Renamed",
            isVisible: false,
        });
        const merged = mergeUserState(oldNode, incoming);
        expect(merged.isVisible).toBe(true);
        expect(merged.title).toBe("Renamed");
        expect((merged as { childrenCount?: number }).childrenCount).toBe(2);
    });

    it("does not mutate the inputs", () => {
        const oldNode = layerNode("1", { isVisible: true });
        const incoming = layerNode("1", { isVisible: false });
        mergeUserState(oldNode, incoming);
        expect(oldNode.isVisible).toBe(true);
        expect(incoming.isVisible).toBe(false);
    });
});
