import { describe, expect, it } from "vitest";
import { GroupedRegistry } from "./GroupedRegistry";

interface Item {
    id: string;
}

const item = (id: string): Item => ({ id });

describe("GroupedRegistry", () => {
    it("adds entries to a group in order", () => {
        const registry = new GroupedRegistry<Item>();
        registry.add("cap", item("a"));
        registry.add("cap", item("b"));
        expect(registry.get("cap").map((i) => i.id)).toEqual(["a", "b"]);
    });

    it("duplicate add within the same group is a no-op", () => {
        const registry = new GroupedRegistry<Item>();
        registry.add("cap", item("a"));
        registry.add("cap", item("a"));
        expect(registry.get("cap")).toHaveLength(1);
    });

    it("the same id in different groups is allowed", () => {
        const registry = new GroupedRegistry<Item>();
        registry.add("a", item("shared"));
        registry.add("b", item("shared"));
        expect(registry.get("a")).toHaveLength(1);
        expect(registry.get("b")).toHaveLength(1);
    });

    it("get returns an empty array for an absent group", () => {
        const registry = new GroupedRegistry<Item>();
        expect(registry.get("missing")).toEqual([]);
    });

    it("has reports group existence", () => {
        const registry = new GroupedRegistry<Item>();
        registry.add("a", item("x"));
        expect(registry.has("a")).toBe(true);
        expect(registry.has("b")).toBe(false);
    });

    it("keys lists every group in insertion order", () => {
        const registry = new GroupedRegistry<Item>();
        registry.add("wms", item("opacity"));
        registry.add("xyz", item("opacity"));
        registry.add("copc", item("size"));
        expect(registry.keys()).toEqual(["wms", "xyz", "copc"]);
    });
});
