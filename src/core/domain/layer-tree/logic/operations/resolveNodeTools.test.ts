import { describe, expect, it } from "vitest";
import type { LayerTool, NodeCapability } from "@core/contracts";
import { resolveNodeTools } from "./resolveNodeTools";

function tool(id: string): LayerTool {
    return { id } as unknown as LayerTool;
}

function cap(toolId: string): NodeCapability {
    return { toolId, slot: "renderer" };
}

describe("resolveNodeTools", () => {
    const byId = (entries: Record<string, LayerTool>) => (id: string) =>
        entries[id];

    it("keeps the capabilities' order", () => {
        const resolved = resolveNodeTools(
            [cap("b"), cap("a")],
            byId({ a: tool("a"), b: tool("b") }),
        );

        expect(resolved.map((t) => t.id)).toEqual(["b", "a"]);
    });

    it("deduplicates by tool id — first capability wins", () => {
        const resolved = resolveNodeTools(
            [cap("a"), cap("a")],
            byId({ a: tool("a") }),
        );

        expect(resolved.map((t) => t.id)).toEqual(["a"]);
    });

    it("skips tool ids missing from the registry", () => {
        const resolved = resolveNodeTools(
            [cap("ghost"), cap("a")],
            byId({ a: tool("a") }),
        );

        expect(resolved.map((t) => t.id)).toEqual(["a"]);
    });

    it("returns nothing for a node without capabilities", () => {
        expect(resolveNodeTools([], byId({}))).toEqual([]);
    });
});
