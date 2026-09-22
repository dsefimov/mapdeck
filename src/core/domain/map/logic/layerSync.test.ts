import { describe, expect, it } from "vitest";
import { classifyRenderUnitChanges } from "./layerSync";
import type { RenderUnit, SnapshotItem, LayerAdapter } from "@core/contracts";

function unit(
    id: string,
    nodeIds: string[],
    config: Record<string, unknown> = {},
    sourceUrl = "https://example.com/src",
): RenderUnit {
    return {
        id,
        nodeIds,
        protocolId: "wms",
        adapter: {} as unknown as LayerAdapter,
        descriptor: { sourceUrl, config },
    };
}

function item(id: string, visible: boolean): SnapshotItem {
    return {
        id,
        visible,
        protocolId: "wms",
        descriptor: { sourceUrl: "https://example.com/src", config: {} },
    };
}

function toMap(units: RenderUnit[]): Map<string, RenderUnit> {
    return new Map(units.map((u) => [u.id, u]));
}

describe("classifyRenderUnitChanges", () => {
    it("classifies units only in desired as added", () => {
        const current = toMap([unit("a", ["a"])]);
        const desired = toMap([unit("a", ["a"]), unit("b", ["b"])]);

        const changes = classifyRenderUnitChanges(
            current,
            desired,
            [item("a", true), item("b", true)],
            new Map([["a", true]]),
        );

        expect(changes.added.map((u) => u.id)).toEqual(["b"]);
        expect(changes.removed).toEqual([]);
        expect(changes.shown).toEqual([]);
        expect(changes.hidden).toEqual([]);
        expect(changes.updated).toEqual([]);
    });

    it("classifies units removed from the snapshot as removed", () => {
        const current = toMap([unit("a", ["a"]), unit("b", ["b"])]);
        const desired = toMap([unit("b", ["b"])]);

        const changes = classifyRenderUnitChanges(
            current,
            desired,
            [item("b", true)],
            new Map([
                ["a", true],
                ["b", true],
            ]),
        );

        expect(changes.removed.map((u) => u.id)).toEqual(["a"]);
        expect(changes.hidden).toEqual([]);
    });

    it("hides a retained unit whose node turned invisible", () => {
        const current = toMap([unit("a", ["a"])]);

        const changes = classifyRenderUnitChanges(
            current,
            new Map(),
            [item("a", false)],
            new Map([["a", true]]),
        );

        expect(changes.hidden.map((u) => u.id)).toEqual(["a"]);
        expect(changes.removed).toEqual([]);
    });

    it("does not re-hide a unit that is already hidden", () => {
        const current = toMap([unit("a", ["a"])]);

        const changes = classifyRenderUnitChanges(
            current,
            new Map(),
            [item("a", false)],
            new Map([["a", false]]),
        );

        expect(changes.hidden).toEqual([]);
        expect(changes.removed).toEqual([]);
    });

    it("shows a hidden unit that reappeared in desired", () => {
        const current = toMap([unit("a", ["a"])]);
        const desired = toMap([unit("a", ["a"])]);

        const changes = classifyRenderUnitChanges(
            current,
            desired,
            [item("a", true)],
            new Map([["a", false]]),
        );

        expect(changes.shown.map((u) => u.id)).toEqual(["a"]);
        expect(changes.updated).toEqual([]);
        expect(changes.added).toEqual([]);
    });

    it("classifies a visible unit with changed config as updated", () => {
        const current = toMap([unit("a", ["a"], { opacity: 1 })]);
        const desired = toMap([unit("a", ["a"], { opacity: 0.5 })]);

        const changes = classifyRenderUnitChanges(
            current,
            desired,
            [item("a", true)],
            new Map([["a", true]]),
        );

        expect(changes.updated.map((u) => u.id)).toEqual(["a"]);
        expect(changes.shown).toEqual([]);
    });

    it("shows and updates a unit whose descriptor changed while hidden", () => {
        const current = toMap([unit("a", ["a"], { opacity: 1 })]);
        const desired = toMap([unit("a", ["a"], { opacity: 0.5 })]);

        const changes = classifyRenderUnitChanges(
            current,
            desired,
            [item("a", true)],
            new Map([["a", false]]),
        );

        expect(changes.shown.map((u) => u.id)).toEqual(["a"]);
        expect(changes.updated.map((u) => u.id)).toEqual(["a"]);
    });

    it("removes a multi-node unit whose nodes are only partially visible", () => {
        const group = unit("g", ["a", "b"]);
        const current = toMap([group]);

        const changes = classifyRenderUnitChanges(
            current,
            new Map(),
            [item("a", false), item("b", true)],
            new Map([["g", true]]),
        );

        expect(changes.removed.map((u) => u.id)).toEqual(["g"]);
        expect(changes.hidden).toEqual([]);
    });

    it("removes a multi-node unit when one node left the snapshot", () => {
        const group = unit("g", ["a", "b"]);
        const current = toMap([group]);

        const changes = classifyRenderUnitChanges(
            current,
            new Map(),
            [item("a", false)],
            new Map([["g", true]]),
        );

        expect(changes.removed.map((u) => u.id)).toEqual(["g"]);
    });

    it("hides a multi-node unit that is fully invisible", () => {
        const group = unit("g", ["a", "b"]);
        const current = toMap([group]);

        const changes = classifyRenderUnitChanges(
            current,
            new Map(),
            [item("a", false), item("b", false)],
            new Map([["g", true]]),
        );

        expect(changes.hidden.map((u) => u.id)).toEqual(["g"]);
        expect(changes.removed).toEqual([]);
    });
});
