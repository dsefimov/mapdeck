import { describe, expect, it, vi } from "vitest";
import type { MapContext } from "@core/contracts";
import { RasterAdapter } from "./RasterAdapter";

type MockFn = ReturnType<typeof vi.fn>;

interface MapStub {
    getLayer: MockFn;
    getSource: MockFn;
    removeLayer: MockFn;
    removeSource: MockFn;
    addSource: MockFn;
    addLayer: MockFn;
    setLayoutProperty: MockFn;
}

function ctxStub(): { ctx: MapContext; map: MapStub } {
    const map: MapStub = {
        getLayer: vi.fn().mockReturnValue(undefined),
        getSource: vi.fn().mockReturnValue(undefined),
        removeLayer: vi.fn(),
        removeSource: vi.fn(),
        addSource: vi.fn(),
        addLayer: vi.fn(),
        setLayoutProperty: vi.fn(),
    };
    return { ctx: { map } as unknown as MapContext, map };
}

function descriptor(config: Record<string, unknown> = {}) {
    return {
        sourceUrl: "https://tiles.test/{z}/{x}/{y}.png",
        config,
    } as never;
}

describe("RasterAdapter", () => {
    it("adds a raster source with 256px tiles and a raster layer", () => {
        const { ctx, map } = ctxStub();

        new RasterAdapter().addToMap("layer-1", descriptor({ opacity: 0.7 }), ctx);

        expect(map.addSource).toHaveBeenCalledWith("layer-1", {
            type: "raster",
            tiles: ["https://tiles.test/{z}/{x}/{y}.png"],
            tileSize: 256,
        });
        expect(map.addLayer).toHaveBeenCalledWith({
            id: "layer-1",
            type: "raster",
            source: "layer-1",
            paint: { "raster-opacity": 0.7 },
        });
    });

    it("passes maxzoom through to the source when configured", () => {
        const { ctx, map } = ctxStub();

        new RasterAdapter().addToMap(
            "layer-1",
            descriptor({ opacity: 1, maxzoom: 8 }),
            ctx,
        );

        expect(map.addSource).toHaveBeenCalledWith(
            "layer-1",
            expect.objectContaining({ maxzoom: 8 }),
        );
    });

    it("replaces an existing layer and source on re-add", () => {
        const { ctx, map } = ctxStub();
        map.getLayer.mockReturnValue({});
        map.getSource.mockReturnValue({});

        new RasterAdapter().addToMap("layer-1", descriptor(), ctx);

        expect(map.removeLayer).toHaveBeenCalledWith("layer-1");
        expect(map.removeSource).toHaveBeenCalledWith("layer-1");
    });

    it("flips visibility through the layout property", () => {
        const { ctx, map } = ctxStub();
        map.getLayer.mockReturnValue({});

        new RasterAdapter().updateVisibility("layer-1", false, ctx);

        expect(map.setLayoutProperty).toHaveBeenCalledWith(
            "layer-1",
            "visibility",
            "none",
        );
    });

    it("leaves an absent layer untouched on visibility flips", () => {
        const { ctx, map } = ctxStub();

        new RasterAdapter().updateVisibility("layer-1", true, ctx);

        expect(map.setLayoutProperty).not.toHaveBeenCalled();
    });
});
