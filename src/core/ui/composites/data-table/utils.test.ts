import { describe, expect, it } from "vitest";
import {
    applyKvSorting,
    applyRowFilters,
    compareValues,
    formatValue,
} from "./utils";

const DICT: Record<string, string> = {};

describe("compareValues", () => {
    it.each([
        [3, 7, -1],
        [7, 3, 1],
        [5, 5, 0],
    ])("compares numbers numerically (%s vs %s → sign %s)", (a, b, expected) => {
        expect(Math.sign(compareValues(a, b))).toBe(expected);
    });

    it("compares mixed and string values lexically", () => {
        expect(compareValues("apple", "banana")).toBeLessThan(0);
        expect(compareValues("10", "9")).toBeLessThan(0);
    });

    it("sorts null to the end regardless of side", () => {
        expect(compareValues(null, 1)).toBe(1);
        expect(compareValues(1, null)).toBe(-1);
    });
});

describe("applyRowFilters", () => {
    const row = { name: "Autzen", points: 1200, active: true };
    // Number grouping is host-locale — the expected filter strings are
    // derived from the table's own formatter, so the suite stays green
    // in any locale.
    const grouped = formatValue(1200, DICT).slice(0, 2);

    it("passes when no filter is set", () => {
        expect(applyRowFilters(row, {}, DICT)).toBe(true);
    });

    it("matches a column filter case-insensitively", () => {
        expect(applyRowFilters(row, { name: "autz" }, DICT)).toBe(true);
        expect(applyRowFilters(row, { name: "moscow" }, DICT)).toBe(false);
    });

    it("requires every column filter to match", () => {
        expect(
            applyRowFilters(row, { name: "autz", points: grouped }, DICT),
        ).toBe(true);
        expect(
            applyRowFilters(row, { name: "autz", points: "9" }, DICT),
        ).toBe(false);
    });

    it("matches the global filter against any formatted value", () => {
        expect(applyRowFilters(row, { _global: grouped }, DICT)).toBe(true);
        expect(applyRowFilters(row, { _global: "zzz" }, DICT)).toBe(false);
    });

    it("an empty column filter value does not constrain the row", () => {
        expect(applyRowFilters(row, { name: "" }, DICT)).toBe(true);
    });
});

describe("applyKvSorting", () => {
    const rows = [
        { name: "bravo", points: 2, _bbox: [0, 0, 1, 1] },
        { name: "alpha", points: 10, _bbox: [0, 0, 1, 1] },
    ];

    it("drops reserved underscore-prefixed keys from the entries", () => {
        const entries = applyKvSorting(rows);
        expect(entries.map(([k]) => k).includes("_bbox")).toBe(false);
    });

    it("sorts by attribute name by default", () => {
        expect(applyKvSorting(rows).map(([k]) => k)).toEqual([
            "name",
            "name",
            "points",
            "points",
        ]);
    });

    it("sorts by attribute column name in the requested direction", () => {
        const asc = applyKvSorting(rows, "attribute", "asc");
        const desc = applyKvSorting(rows, "attribute", "desc");
        expect(asc).toEqual([
            ["name", "bravo"],
            ["name", "alpha"],
            ["points", 2],
            ["points", 10],
        ]);
        expect(desc).toEqual([
            ["points", 2],
            ["points", 10],
            ["name", "bravo"],
            ["name", "alpha"],
        ]);
    });

    it("sorts by cell value in the requested direction", () => {
        const asc = applyKvSorting(rows, "value", "asc");
        const desc = applyKvSorting(rows, "value", "desc");
        expect(asc).toEqual([
            ["points", 2],
            ["points", 10],
            ["name", "alpha"],
            ["name", "bravo"],
        ]);
        expect(desc).toEqual([
            ["name", "bravo"],
            ["name", "alpha"],
            ["points", 10],
            ["points", 2],
        ]);
    });
});
