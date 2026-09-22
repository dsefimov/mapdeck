import { describe, expect, it } from "vitest";
import { idsToRemove } from "./idsToRemove";
import { treeNode } from "./__testFactories";

describe("idsToRemove", () => {
    it("returns empty when existingIds is empty", () => {
        const result = idsToRemove([], [treeNode("a")]);
        expect(result).toEqual([]);
    });

    it("returns all existing ids when incoming is empty", () => {
        const result = idsToRemove(["a", "b"], []);
        expect(result).toEqual(["a", "b"]);
    });

    it("returns empty when all ids match incoming nodes", () => {
        const result = idsToRemove(["a", "b"], [treeNode("a"), treeNode("b")]);
        expect(result).toEqual([]);
    });

    it("returns only ids not present in incoming (partial match)", () => {
        const result = idsToRemove(["a", "b", "c"], [treeNode("a")]);
        expect(result).toEqual(["b", "c"]);
    });

    it("preserves duplicate unmatched ids in output", () => {
        // "a" is NOT in incoming, so both duplicates are kept
        const result = idsToRemove(["a", "a", "b"], [treeNode("c")]);
        expect(result).toEqual(["a", "a", "b"]);
    });

    it("works with Set as Iterable input", () => {
        const result = idsToRemove(new Set(["a", "b"]), [treeNode("a")]);
        expect(result).toEqual(["b"]);
    });

    it("preserves order of existingIds in output", () => {
        const result = idsToRemove(["c", "b", "a"], [treeNode("b")]);
        expect(result).toEqual(["c", "a"]);
    });
});
