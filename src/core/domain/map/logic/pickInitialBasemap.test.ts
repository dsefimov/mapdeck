import { describe, expect, it } from "vitest";
import type { BaseMapConfig, BasemapStatus } from "@core/contracts";
import { pickInitialBasemap } from "./pickInitialBasemap";

function bm(id: string): BaseMapConfig {
    return { id, name: id } as BaseMapConfig;
}

function statusesOf(
    map: Record<string, BasemapStatus>,
): (id: string) => BasemapStatus {
    return (id) => map[id] ?? "loading";
}

describe("pickInitialBasemap", () => {
    it("prefers the active basemap when it is healthy", () => {
        const picked = pickInitialBasemap(
            bm("a"),
            [bm("a"), bm("b")],
            statusesOf({ a: "success", b: "success" }),
        );

        expect(picked?.id).toBe("a");
    });

    it("skips an unhealthy active basemap to the first healthy one", () => {
        const picked = pickInitialBasemap(
            bm("a"),
            [bm("a"), bm("b"), bm("c")],
            statusesOf({ a: "error", b: "error", c: "success" }),
        );

        expect(picked?.id).toBe("c");
    });

    it("keeps the active basemap when nothing probes healthy", () => {
        const picked = pickInitialBasemap(
            bm("a"),
            [bm("a"), bm("b")],
            statusesOf({ a: "error", b: "error" }),
        );

        expect(picked?.id).toBe("a");
    });

    it("falls back to the first available without an active one", () => {
        const picked = pickInitialBasemap(
            undefined,
            [bm("a"), bm("b")],
            statusesOf({ a: "error", b: "error" }),
        );

        expect(picked?.id).toBe("a");
    });

    it("returns nothing without configs", () => {
        expect(pickInitialBasemap(undefined, [], statusesOf({}))).toBe(
            undefined,
        );
    });
});
