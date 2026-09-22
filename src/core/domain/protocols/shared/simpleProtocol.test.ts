import { describe, expect, it } from "vitest";
import type { LayerAdapter, LayerStyle, Protocol } from "@core/contracts";
import { createSimpleProtocol } from "./simpleProtocol";

const STUB_ADAPTER: LayerAdapter = {
    nativeLayerOrdering: true,
    addToMap: () => {},
    removeFromMap: () => {},
    updateVisibility: () => {},
    updateConfig: () => {},
};

interface TestConfig {
    type: "test";
    url: string;
    opacity: number;
}

const build = (): Protocol<TestConfig> =>
    createSimpleProtocol<TestConfig>({
        id: "test",
        label: "Test Protocol",
        defaultStyle: { paint: { "raster-opacity": 0.5 } },
        adapter: STUB_ADAPTER,
        buildConfig: ({ sourceUrl, style, params }) => ({
            type: "test",
            url: sourceUrl,
            opacity:
                (style.paint?.["raster-opacity"] as number | undefined) ?? 1,
            ...(typeof params.extra === "string" ? { extra: params.extra } : {}),
        }) as TestConfig,
    });

describe("createSimpleProtocol", () => {
    it("exposes identity, label, style and its adapter", () => {
        const protocol = build();
        expect(protocol.id).toBe("test");
        expect(protocol.label).toBe("Test Protocol");
        expect(protocol.defaultStyle).toEqual({ paint: { "raster-opacity": 0.5 } });
        expect(protocol.getLayerAdapter()).toBe(STUB_ADAPTER);
    });

    it("builds the descriptor from the merged style and params", () => {
        const protocol = build();
        const style: LayerStyle = { paint: { "raster-opacity": 0.9 } };
        const url = "https://tiles.example/{z}/{x}/{y}";
        const d = protocol.createRenderDescriptor(url, style, { extra: "e" });
        expect(d.sourceUrl).toBe(url);
        expect(d.config).toEqual({
            type: "test",
            url,
            opacity: 0.9,
            extra: "e",
        });
    });

    it("falls back to the default style when the node has none", () => {
        const d = build().createRenderDescriptor("https://x");
        expect(d.config).toEqual({
            type: "test",
            url: "https://x",
            opacity: 0.5,
        });
    });
});
