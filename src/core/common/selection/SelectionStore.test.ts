import { configure } from "mobx";
import { describe, expect, it } from "vitest";
import { Bbox } from "@core/lib/geo";
import { SelectionStore } from "./SelectionStore";
import type { SelectionRecord } from "./types";

// Reproduce production MobX strictness (src/app/mobxConfig.ts).
configure({ enforceActions: "always" });

const record = (key: string, west = 0): SelectionRecord => ({
    key,
    footprint: { kind: "bbox", bbox: new Bbox([west, 0, west + 1, 1]) },
});

describe("SelectionStore", () => {
    it("applies modes to one layer without touching others", () => {
        const store = new SelectionStore();
        store.applySelection("a", [record("a1"), record("a2")], "new");
        store.applySelection("b", [record("b1")], "new");

        store.applySelection("a", [record("a2")], "remove");

        expect(store.countFor("a")).toBe(1);
        expect(store.countFor("b")).toBe(1);
        expect(store.layerCounts).toEqual([
            { layerId: "a", count: 1 },
            { layerId: "b", count: 1 },
        ]);
    });

    it("drops a layer whose selection became empty", () => {
        const store = new SelectionStore();
        store.applySelection("a", [record("a1")], "new");

        store.clearLayer("a");

        expect(store.isEmpty).toBe(true);
        expect(store.hasKey("a", "a1")).toBe(false);
    });

    it("toggles a record and reports keys per layer", () => {
        const store = new SelectionStore();
        store.toggleRecord("a", record("a1"));

        expect(store.keysFor("a")).toEqual(new Set(["a1"]));

        store.toggleRecord("a", { key: "a1", footprint: null });

        expect(store.keysFor("a").size).toBe(0);
    });

    it("unions footprint bboxes into the layer extent", () => {
        const store = new SelectionStore();
        store.applySelection("a", [record("a1", 5), record("a2", 9)], "new");

        const extent = store.layerExtent("a");

        expect(extent && [extent.west, extent.east]).toEqual([5, 10]);
    });

    it("tracks whether a layer's features have stable ids", () => {
        const store = new SelectionStore();

        expect(store.hasStableIds("a")).toBe(false);
        store.markStableIds("a", true);
        expect(store.hasStableIds("a")).toBe(true);
    });

    it("clears every layer at once", () => {
        const store = new SelectionStore();
        store.applySelection("a", [record("a1")], "new");
        store.applySelection("b", [record("b1")], "new");

        store.clearAll();

        expect(store.isEmpty).toBe(true);
    });

    it("retainStableKeys drops only index-keyed records", () => {
        const store = new SelectionStore();
        store.applySelection(
            "a",
            [record("feature-1"), { key: "row-0", footprint: null }],
            "new",
        );

        store.retainStableKeys("a");

        expect(store.keysFor("a")).toEqual(new Set(["feature-1"]));

        // All-stable selections keep their identity (no churn).
        const before = store.layers.get("a");
        store.retainStableKeys("a");
        expect(store.layers.get("a")).toBe(before);
    });
});
