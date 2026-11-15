import { describe, expect, it, vi } from "vitest";
import type { SourceAdapter } from "@core/contracts";
import { SourceAdapterFactory } from "./SourceAdapterFactory";

function adapter(type: string): SourceAdapter {
    return {
        type,
        fetchRoot: vi.fn(async () => []),
        fetchChildren: vi.fn(async () => []),
        initialize: vi.fn(),
        dispose: vi.fn(),
    };
}

describe("SourceAdapterFactory", () => {
    it("returns the adapter registered under its type", () => {
        const factory = new SourceAdapterFactory();
        const stac = adapter("stac");
        factory.register(stac);

        expect(factory.get("stac")).toBe(stac);
    });

    it("a typeless lookup resolves to nothing — no implicit default", () => {
        const factory = new SourceAdapterFactory();
        factory.register(adapter("stac"));
        factory.register(adapter("wms"));

        expect(factory.get()).toBeUndefined();
    });

    it("initializes an adapter only when config accompanies the registration", () => {
        const factory = new SourceAdapterFactory();
        const configured = adapter("stac");
        const bare = adapter("wms");

        factory.register(configured, { url: "https://example.com" });
        factory.register(bare);

        expect(configured.initialize).toHaveBeenCalledWith({
            url: "https://example.com",
        });
        expect(bare.initialize).not.toHaveBeenCalled();
    });

    it("a duplicate type throws — silent replacement is forbidden", () => {
        const factory = new SourceAdapterFactory();
        factory.register(adapter("stac"));

        expect(() => factory.register(adapter("stac"))).toThrow(
            /already registered/,
        );
    });

    it("an explicit override replaces the adapter", () => {
        const factory = new SourceAdapterFactory();
        const first = adapter("stac");
        const second = adapter("stac");
        factory.register(first);
        factory.register(second, undefined, { override: true });

        expect(factory.get("stac")).toBe(second);
    });
});
