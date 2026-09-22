import { describe, it, expect } from "vitest";
import type { FeatureProvider } from "@core/contracts";
import { FeatureProviderRegistry } from "./FeatureProviderRegistry";

function stubProvider(): FeatureProvider {
    return { collect: () => [] };
}

describe("FeatureProviderRegistry", () => {
    it("returns providers in registration order", () => {
        const registry = new FeatureProviderRegistry();
        const first = stubProvider();
        const second = stubProvider();

        registry.register("a", first);
        registry.register("b", second);

        expect(registry.getAll()).toEqual([first, second]);
    });

    it("has() reports registration by id", () => {
        const registry = new FeatureProviderRegistry();

        registry.register("overlay", stubProvider());

        expect(registry.has("overlay")).toBe(true);
        expect(registry.has("vector")).toBe(false);
    });

    it("registering a duplicate id throws", () => {
        const registry = new FeatureProviderRegistry();
        registry.register("wms", stubProvider());

        expect(() => registry.register("wms", stubProvider())).toThrow(
            /already registered/,
        );
    });
});
