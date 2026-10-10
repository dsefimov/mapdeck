import { describe, expect, it, vi } from "vitest";
import { logger } from "@core/lib/logger";
import { KeyedRegistry } from "./KeyedRegistry";

interface Item {
    value: string;
}

function registry(): KeyedRegistry<string, Item> {
    return new KeyedRegistry<string, Item>("Test item");
}

describe("KeyedRegistry", () => {
    it("registers under an external key and reads back by it", () => {
        const items = registry();
        items.register("stac", { value: "a" });

        expect(items.get("stac")).toEqual({ value: "a" });
        expect(items.has("stac")).toBe(true);
        expect(items.get("missing")).toBeUndefined();
    });

    it("lists entries in registration order", () => {
        const items = registry();
        items.register("a", { value: "1" });
        items.register("b", { value: "2" });

        expect(items.getAll().map((i) => i.value)).toEqual(["1", "2"]);
    });

    it("throws on an occupied key — the registry default", () => {
        const items = registry();
        items.register("a", { value: "1" });

        expect(() => items.register("a", { value: "2" })).toThrow(
            'Test item "a" is already registered.',
        );
    });

    it("replaces on an explicit override, with a visible warning", () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const items = registry();
        items.register("a", { value: "1" });

        items.register("a", { value: "2" }, { override: true });

        expect(items.get("a")).toEqual({ value: "2" });
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('overriding "a"'),
        );
    });
});
