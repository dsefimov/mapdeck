import { describe, expect, it } from "vitest";
import { Bbox } from "@core/lib/geo";
import type { SelectionRecord } from "../types";
import {
    applySelection,
    toggleRecord,
    unionRecordExtents,
} from "./selectionOps";

const record = (key: string, west = 0): SelectionRecord => ({
    key,
    footprint: {
        kind: "bbox",
        bbox: new Bbox([west, 0, west + 1, 1]),
    },
});

describe("applySelection", () => {
    it("replaces the selection in new mode", () => {
        const existing = applySelection(undefined, [record("a")], "new");

        const next = applySelection(existing, [record("b")], "new");

        expect(next && [...next.keys()]).toEqual(["b"]);
    });

    it("returns null for an empty new selection", () => {
        expect(applySelection(undefined, [], "new")).toBeNull();
    });

    it("merges in add mode and keeps the richer existing record", () => {
        const bare: SelectionRecord = { key: "a", footprint: null };
        const existing = applySelection(undefined, [record("a")], "new");

        const next = applySelection(existing, [bare, record("b")], "add");

        expect(
            next && [...next.keys()].sort((a, b) => a.localeCompare(b)),
        ).toEqual(["a", "b"]);
        expect(next?.get("a")?.footprint?.kind).toBe("bbox");
    });

    it("deletes only matched keys in remove mode", () => {
        const existing = applySelection(
            undefined,
            [record("a"), record("b")],
            "new",
        );

        const next = applySelection(
            existing,
            [{ key: "a", footprint: null }],
            "remove",
        );

        expect(next && [...next.keys()]).toEqual(["b"]);
    });

    it("drops the layer when remove empties it", () => {
        const existing = applySelection(undefined, [record("a")], "new");

        expect(
            applySelection(existing, [{ key: "a", footprint: null }], "remove"),
        ).toBeNull();
    });
});

describe("toggleRecord", () => {
    it("adds when absent, removes when present", () => {
        const added = toggleRecord(undefined, record("a"));
        expect(added?.has("a")).toBe(true);

        expect(toggleRecord(added, record("a"))).toBeNull();
    });
});

describe("unionRecordExtents", () => {
    it("unions footprint bboxes and skips bare records", () => {
        const selection = applySelection(
            undefined,
            [record("a", 0), record("b", 10), { key: "c", footprint: null }],
            "new",
        );

        const extent = unionRecordExtents(selection);

        expect(extent && [extent.west, extent.east]).toEqual([0, 11]);
    });

    it("is null for an empty selection", () => {
        expect(unionRecordExtents(undefined)).toBeNull();
    });
});
