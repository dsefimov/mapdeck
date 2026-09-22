import { describe, expect, it, vi } from "vitest";
import type { MapContext, RenderDescriptor } from "@core/contracts";

vi.mock("@core/ui/theme", () => ({
    DEFAULT_ACCENT_CSS: "#112233",
    DEFAULT_TEXT_CSS: "#332211",
}));

import { VectorAdapter } from "./VectorAdapter";

function mapCtx() {
    const map = {
        getLayer: vi.fn().mockReturnValue(undefined),
        getSource: vi.fn().mockReturnValue(undefined),
        removeLayer: vi.fn(),
        removeSource: vi.fn(),
        addSource: vi.fn(),
        addLayer: vi.fn(),
        setLayoutProperty: vi.fn(),
        setPaintProperty: vi.fn(),
    };
    return { map, ctx: { map } as unknown as MapContext };
}

function descriptor(
    config: Record<string, unknown>,
): RenderDescriptor {
    return {
        sourceUrl: "https://tiles.test/{z}/{x}/{y}.pbf",
        config,
    } as unknown as RenderDescriptor;
}

describe("VectorAdapter.addToMap", () => {
    it("adds a vector source and a layer with source-layer", () => {
        const { map, ctx } = mapCtx();
        new VectorAdapter().addToMap(
            "layer-1",
            descriptor({ layerType: "fill", sourceLayer: "water" }),
            ctx,
        );
        expect(map.addSource).toHaveBeenCalledWith("layer-1", {
            type: "vector",
            tiles: ["https://tiles.test/{z}/{x}/{y}.pbf"],
        });
        const spec = map.addLayer.mock.calls[0]![0];
        expect(spec["source-layer"]).toBe("water");
        expect(spec.type).toBe("fill");
    });

    it("omits source-layer when the config has none", () => {
        const { map, ctx } = mapCtx();
        new VectorAdapter().addToMap(
            "layer-2",
            descriptor({ layerType: "line" }),
            ctx,
        );
        const spec = map.addLayer.mock.calls[0]![0];
        expect(spec["source-layer"]).toBeUndefined();
        expect(spec.type).toBe("line");
    });
});

describe("VectorAdapter.updateConfig paint application", () => {
    function renderUnit(config: Record<string, unknown>) {
        return {
            id: "layer-1",
            descriptor: descriptor(config),
        } as Parameters<VectorAdapter["updateConfig"]>[0];
    }

    it("applies text paint to symbol layers instead of a silent no-op", () => {
        const { map, ctx } = mapCtx();
        map.getLayer.mockReturnValue({}); // the layer exists — update path
        const adapter = new VectorAdapter();

        adapter.updateConfig(
            renderUnit({
                layerType: "symbol",
                paint: { "text-color": "#abcdef", "text-opacity": 0.4 },
            }),
            ctx,
        );

        expect(map.setPaintProperty).toHaveBeenCalledWith(
            "layer-1",
            "text-color",
            "#abcdef",
        );
        expect(map.setPaintProperty).toHaveBeenCalledWith(
            "layer-1",
            "text-opacity",
            0.4,
        );
    });

    it("keeps applying fill paint as a regression guard", () => {
        const { map, ctx } = mapCtx();
        map.getLayer.mockReturnValue({});
        const adapter = new VectorAdapter();

        adapter.updateConfig(
            renderUnit({
                layerType: "fill",
                paint: { "fill-color": "#123456", "fill-opacity": 0.7 },
            }),
            ctx,
        );

        expect(map.setPaintProperty).toHaveBeenCalledWith(
            "layer-1",
            "fill-color",
            "#123456",
        );
        expect(map.setPaintProperty).toHaveBeenCalledWith(
            "layer-1",
            "fill-opacity",
            0.7,
        );
    });
});
