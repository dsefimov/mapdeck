import { describe, expect, it } from "vitest";
import { Registry } from "./Registry";

interface Item {
    id: string;
    label: string;
}

const item = (id: string, label = id): Item => ({ id, label });

describe("Registry", () => {
    it("registers a new id and retrieves it", () => {
        const registry = new Registry<Item>();
        registry.register(item("wms", "WMS"));
        expect(registry.get("wms")).toEqual({ id: "wms", label: "WMS" });
    });

    it("throws on duplicate id and keeps the first entry", () => {
        const registry = new Registry<Item>();
        registry.register(item("wms"));
        expect(() => registry.register(item("wms", "other"))).toThrow(
            'Item "wms" is already registered',
        );
        expect(registry.get("wms")?.label).toBe("wms");
    });

    it("returns undefined for an absent id", () => {
        const registry = new Registry<Item>();
        expect(registry.get("unknown")).toBeUndefined();
    });

    it("has reports presence", () => {
        const registry = new Registry<Item>();
        registry.register(item("a"));
        expect(registry.has("a")).toBe(true);
        expect(registry.has("b")).toBe(false);
    });

    it("getAll returns entries in registration order", () => {
        const registry = new Registry<Item>();
        registry.register(item("a"));
        registry.register(item("b"));
        expect(registry.getAll().map((i) => i.id)).toEqual(["a", "b"]);
    });

    it("an explicit override replaces the entry and keeps registration order", () => {
        const registry = new Registry<Item>();
        registry.register(item("a"));
        registry.register(item("b"));
        registry.register(item("a", "replacement"), { override: true });

        expect(registry.get("a")).toEqual({ id: "a", label: "replacement" });
        expect(registry.getAll().map((i) => i.id)).toEqual(["a", "b"]);
    });

    it("a duplicate without the override flag still throws after an override", () => {
        const registry = new Registry<Item>();
        registry.register(item("a"));
        registry.register(item("a", "replacement"), { override: true });

        expect(() => registry.register(item("a"))).toThrow(/already registered/);
        expect(registry.get("a")).toEqual({ id: "a", label: "replacement" });
    });
});
