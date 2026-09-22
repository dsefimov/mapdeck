import { describe, expect, it } from "vitest";
import type { AttributeFetchResult, FeatureRow } from "@core/contracts";
import { mergeAttributePage } from "./mergeAttributePage";
import { attributeCacheKey } from "./attributeCacheKey";

function row(id: string): FeatureRow {
    return { id };
}

function page(ids: string[], totalFeatures = ids.length): AttributeFetchResult {
    return { features: ids.map(row), totalFeatures };
}

describe("mergeAttributePage", () => {
    it("replaces the cache on the first page", () => {
        const merged = mergeAttributePage(
            [row("stale-1"), row("stale-2")],
            page(["a", "b"]),
            0,
        );

        expect(merged.features.map((f) => f.id)).toEqual(["a", "b"]);
        expect(merged.totalFeatures).toBe(2);
    });

    it("appends a later page onto the cached rows", () => {
        const merged = mergeAttributePage(
            [row("a")],
            page(["b", "c"], 3),
            1,
        );

        expect(merged.features.map((f) => f.id)).toEqual(["a", "b", "c"]);
        expect(merged.totalFeatures).toBe(3);
    });

    it("appends onto nothing when the cache is empty", () => {
        const merged = mergeAttributePage(undefined, page(["a"]), 5);

        expect(merged.features.map((f) => f.id)).toEqual(["a"]);
    });
});

describe("attributeCacheKey", () => {
    it("is the bare layer id without a sort", () => {
        expect(attributeCacheKey("layer-1", undefined)).toBe("layer-1");
    });

    it("carries the sort column and direction", () => {
        expect(
            attributeCacheKey("layer-1", {
                sortBy: "name",
                sortDirection: "desc",
            }),
        ).toBe("layer-1|s:name:desc");
    });

    it("separates ascending from descending", () => {
        const asc = attributeCacheKey("l", {
            sortBy: "name",
            sortDirection: "asc",
        });
        const desc = attributeCacheKey("l", {
            sortBy: "name",
            sortDirection: "desc",
        });

        expect(asc).not.toBe(desc);
    });
});
