import { describe, expect, it } from "vitest";

import { appendUrlParams } from "./appendUrlParams";

describe("appendUrlParams", () => {
    it("adds parameters to a bare URL", () => {
        expect(appendUrlParams("https://x.io/items", { limit: "50" })).toBe(
            "https://x.io/items?limit=50",
        );
    });

    it("preserves existing query parameters", () => {
        const url = appendUrlParams("https://x.io/items?f=json&key=zzz", {
            bbox: "0,1,2,3",
        });
        const parsed = new URL(url);
        expect(parsed.searchParams.get("f")).toBe("json");
        expect(parsed.searchParams.get("key")).toBe("zzz");
        expect(parsed.searchParams.get("bbox")).toBe("0,1,2,3");
    });

    it("overrides a parameter that already exists", () => {
        const url = appendUrlParams("https://x.io/items?limit=10", {
            limit: "5000",
        });
        expect(new URL(url).searchParams.getAll("limit")).toEqual(["5000"]);
    });
});
