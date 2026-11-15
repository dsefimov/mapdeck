import { describe, expect, it } from "vitest";
import { resolveHiddenClassifications } from "./classificationFilter";

describe("resolveHiddenClassifications", () => {
    it("returns an empty list for absent or non-list metadata", () => {
        expect(resolveHiddenClassifications(undefined)).toEqual([]);
        expect(resolveHiddenClassifications(null)).toEqual([]);
        expect(resolveHiddenClassifications("2")).toEqual([]);
        expect(resolveHiddenClassifications(2)).toEqual([]);
    });

    it("keeps integer LAS codes, sorted and deduplicated", () => {
        expect(
            resolveHiddenClassifications([6, 2, 6, 18, 0]),
        ).toEqual([0, 2, 6, 18]);
    });

    it("drops non-integer and out-of-range entries", () => {
        expect(
            resolveHiddenClassifications([2, 2.5, -1, 256, "6", null]),
        ).toEqual([2]);
    });
});
