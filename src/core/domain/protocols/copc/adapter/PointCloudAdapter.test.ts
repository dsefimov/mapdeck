import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
    MapContext,
    PointCloudData,
    RenderDescriptor,
    RenderUnit,
} from "@core/contracts";
import { logger } from "@core/lib/logger";
import { PointCloudAdapter } from "./PointCloudAdapter";

interface MockLoader {
    initialize: ReturnType<typeof vi.fn>;
    setOnPointsLoaded: ReturnType<typeof vi.fn>;
    setEffectiveBaseline: ReturnType<typeof vi.fn>;
    selectNodesSSE: ReturnType<typeof vi.fn>;
    setCameraSnapshot: ReturnType<typeof vi.fn>;
    switchScheme: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
}

const mockLoaderInstances: MockLoader[] = [];

const { failingInitialize } = vi.hoisted(() => ({
    failingInitialize: { current: null as Error | null },
}));

vi.mock("laz-perf", () => ({
    createLazPerf: vi.fn(() => Promise.resolve({})),
}));

vi.mock("../engine/CopcStreamingLoader", () => {
    class MockCopcStreamingLoader {
        initialize = vi.fn(() =>
            failingInitialize.current
                ? Promise.reject(failingInitialize.current)
                : Promise.resolve({
                      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
                      totalPoints: 0,
                      spacing: 1,
                      spacingMeters: 1,
                  }),
        );
        setOnPointsLoaded = vi.fn();
        setEffectiveBaseline = vi.fn();
        selectNodesSSE = vi.fn();
        setCameraSnapshot = vi.fn();
        switchScheme = vi.fn();
        destroy = vi.fn();

        constructor(..._args: unknown[]) {
            mockLoaderInstances.push(this as never);
        }
    }
    return { CopcStreamingLoader: MockCopcStreamingLoader };
});

vi.mock("../engine/ViewportManager", () => {
    class MockViewportManager {
        start = vi.fn();
        stop = vi.fn();
        destroy = vi.fn();
    }
    return { ViewportManager: MockViewportManager };
});

vi.mock("./PointCloudLayerFactory", () => ({
    createPointCloudLayer: vi.fn((layerId: string) => ({
        id: layerId,
        props: {},
    })),
}));

const DESCRIPTOR: RenderDescriptor = {
    sourceUrl: "https://example.com/cloud.copc.laz",
    config: { pointSize: 2 },
};

function mockData(): PointCloudData {
    return {
        pointCount: 1,
        positions: new Float32Array(3),
        colors: new Uint8Array(4),
        coordinateOrigin: [0, 0, 0],
    } as unknown as PointCloudData;
}

function createHarness(): {
    overlayManager: {
        addLayer: ReturnType<typeof vi.fn>;
        removeLayer: ReturnType<typeof vi.fn>;
        updateLayer: ReturnType<typeof vi.fn>;
        setLayerVisibility: ReturnType<typeof vi.fn>;
    };
    ctx: MapContext;
    reportLayerError: ReturnType<typeof vi.fn>;
} {
    const overlayManager = {
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
        updateLayer: vi.fn(),
        setLayerVisibility: vi.fn(),
    };
    const reportLayerError = vi.fn();
    const ctx = {
        map: {},
        overlayManager,
        reportLayerError,
    } as unknown as MapContext;
    return { overlayManager, ctx, reportLayerError };
}

/** Flush the async layer-init task so setOnPointsLoaded is registered. */
async function flushAsync(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function triggerPointsLoaded(
    loaderIndex: number,
    data: PointCloudData = mockData(),
): void {
    const loader = mockLoaderInstances[loaderIndex];
    if (!loader) throw new Error(`No mock loader at index ${loaderIndex}`);
    const calls = loader.setOnPointsLoaded.mock.calls;
    const callback = calls[calls.length - 1]![0] as (d: PointCloudData) => void;
    callback(data);
}

describe("PointCloudAdapter visibility retention", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLoaderInstances.length = 0;
    });

    it("keeps a hidden layer hidden when new point data loads", async () => {
        const { overlayManager, ctx } = createHarness();
        const adapter = new PointCloudAdapter();

        adapter.addToMap("cloud", DESCRIPTOR, ctx);
        await flushAsync();

        adapter.updateVisibility("cloud", false, ctx);
        expect(overlayManager.setLayerVisibility).toHaveBeenCalledWith(
            "cloud",
            false,
        );

        // Streaming continues while hidden — new data arrives (e.g. after a
        // map move) and re-adds the deck layer.
        triggerPointsLoaded(0);

        expect(overlayManager.addLayer).toHaveBeenCalledWith(
            "cloud",
            expect.anything(),
        );
        expect(overlayManager.setLayerVisibility).toHaveBeenLastCalledWith(
            "cloud",
            false,
        );
    });

    it("does not re-hide a visible layer when new point data loads", async () => {
        const { overlayManager, ctx } = createHarness();
        const adapter = new PointCloudAdapter();

        adapter.addToMap("cloud", DESCRIPTOR, ctx);
        await flushAsync();

        triggerPointsLoaded(0);

        expect(overlayManager.addLayer).toHaveBeenCalledWith(
            "cloud",
            expect.anything(),
        );
        expect(overlayManager.setLayerVisibility).not.toHaveBeenCalledWith(
            "cloud",
            false,
        );
    });

    it("keeps a hidden layer hidden across a structural config update", async () => {
        const { overlayManager, ctx } = createHarness();
        const adapter = new PointCloudAdapter();

        adapter.addToMap("cloud", DESCRIPTOR, ctx);
        await flushAsync();

        adapter.updateVisibility("cloud", false, ctx);

        // maxOctreeDepth is not a visual field → forces a remove+add recreate.
        const structuralUnit = {
            id: "cloud",
            protocolId: "copc",
            adapter,
            descriptor: {
                sourceUrl: DESCRIPTOR.sourceUrl,
                config: { pointSize: 3, maxOctreeDepth: 8 },
            },
        } as unknown as RenderUnit;
        adapter.updateConfig(structuralUnit, ctx);

        expect(overlayManager.removeLayer).toHaveBeenCalledWith("cloud");
        await flushAsync();

        triggerPointsLoaded(1);

        expect(overlayManager.addLayer).toHaveBeenCalledWith(
            "cloud",
            expect.anything(),
        );
        expect(overlayManager.setLayerVisibility).toHaveBeenLastCalledWith(
            "cloud",
            false,
        );
    });

    it("re-creates the deck layer from retained data when shown", async () => {
        const { overlayManager, ctx } = createHarness();
        const adapter = new PointCloudAdapter();

        adapter.addToMap("cloud", DESCRIPTOR, ctx);
        await flushAsync();
        triggerPointsLoaded(0);
        expect(overlayManager.addLayer).toHaveBeenCalledTimes(1);

        adapter.updateVisibility("cloud", false, ctx);
        expect(overlayManager.setLayerVisibility).toHaveBeenCalledWith(
            "cloud",
            false,
        );

        // Showing re-creates the deck layer from retained data so it renders
        // immediately — no viewport change required. Visibility was touched
        // only once (the hide); the show goes through addLayer instead.
        adapter.updateVisibility("cloud", true, ctx);

        expect(overlayManager.addLayer).toHaveBeenCalledTimes(2);
        expect(overlayManager.addLayer).toHaveBeenLastCalledWith(
            "cloud",
            expect.anything(),
        );
        expect(overlayManager.setLayerVisibility).toHaveBeenCalledTimes(1);
        expect(overlayManager.setLayerVisibility).toHaveBeenCalledWith(
            "cloud",
            false,
        );
    });

    it("falls back to setLayerVisibility when showing before any data arrived", async () => {
        const { overlayManager, ctx } = createHarness();
        const adapter = new PointCloudAdapter();

        adapter.addToMap("cloud", DESCRIPTOR, ctx);
        await flushAsync();

        adapter.updateVisibility("cloud", true, ctx);

        expect(overlayManager.addLayer).not.toHaveBeenCalled();
        expect(overlayManager.setLayerVisibility).toHaveBeenCalledWith(
            "cloud",
            true,
        );
    });
});

describe("PointCloudAdapter color scheme switching", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLoaderInstances.length = 0;
    });

    it("routes a colorScheme config change to switchScheme", async () => {
        const { ctx } = createHarness();
        const adapter = new PointCloudAdapter();

        adapter.addToMap(
            "cloud",
            { ...DESCRIPTOR, config: { pointSize: 2, colorScheme: "rgb" } },
            ctx,
        );
        await flushAsync();

        const loader = mockLoaderInstances[0]!;
        const unit = {
            id: "cloud",
            protocolId: "copc",
            adapter,
            descriptor: {
                sourceUrl: DESCRIPTOR.sourceUrl,
                config: { pointSize: 2, colorScheme: "elevation" },
            },
        } as unknown as RenderUnit;
        adapter.updateConfig(unit, ctx);

        expect(loader.switchScheme).toHaveBeenCalledWith("elevation");
    });
});

describe("PointCloudAdapter error reporting", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLoaderInstances.length = 0;
        failingInitialize.current = null;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("logs, cleans up, and reports an initialization failure", async () => {
        const { ctx, reportLayerError } = createHarness();
        const adapter = new PointCloudAdapter();
        const errorSpy = vi.spyOn(logger, "error");

        failingInitialize.current = new Error("network down");
        adapter.addToMap("cloud", DESCRIPTOR, ctx);
        await flushAsync();

        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('failed to initialize layer "cloud"'),
            expect.any(Error),
        );
        expect(reportLayerError).toHaveBeenCalledWith(
            "cloud",
            expect.any(Error),
        );
        expect(adapter.getLoadedData("cloud")).toBeUndefined();

        const loader = mockLoaderInstances[0]!;
        expect(loader.destroy).toHaveBeenCalled();
    });

    it("skips a visual update before data arrives without logging an error", async () => {
        const { overlayManager, ctx } = createHarness();
        const adapter = new PointCloudAdapter();
        const errorSpy = vi.spyOn(logger, "error");

        adapter.addToMap("cloud", DESCRIPTOR, ctx);
        await flushAsync();

        // Before the first points arrive state.data is null — there is no
        // deck layer to update in place yet.
        const unit = {
            id: "cloud",
            protocolId: "copc",
            adapter,
            descriptor: {
                sourceUrl: DESCRIPTOR.sourceUrl,
                config: { pointSize: 3 },
            },
        } as unknown as RenderUnit;
        adapter.updateConfig(unit, ctx);

        expect(overlayManager.updateLayer).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("applies a visual update in place once data has arrived", async () => {
        const { overlayManager, ctx } = createHarness();
        const adapter = new PointCloudAdapter();
        const errorSpy = vi.spyOn(logger, "error");

        adapter.addToMap("cloud", DESCRIPTOR, ctx);
        await flushAsync();
        triggerPointsLoaded(0);
        expect(overlayManager.addLayer).toHaveBeenCalledTimes(1);

        const unit = {
            id: "cloud",
            protocolId: "copc",
            adapter,
            descriptor: {
                sourceUrl: DESCRIPTOR.sourceUrl,
                config: { pointSize: 4 },
            },
        } as unknown as RenderUnit;
        adapter.updateConfig(unit, ctx);

        expect(overlayManager.updateLayer).toHaveBeenCalledTimes(1);
        expect(overlayManager.updateLayer.mock.calls[0]![0]).toBe("cloud");
        expect(overlayManager.addLayer).toHaveBeenCalledTimes(1);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("logs a deck-layer add failure after points load", async () => {
        const { overlayManager, ctx } = createHarness();
        const adapter = new PointCloudAdapter();
        const errorSpy = vi.spyOn(logger, "error");

        overlayManager.addLayer.mockImplementation(() => {
            throw new Error("deck failed");
        });

        adapter.addToMap("cloud", DESCRIPTOR, ctx);
        await flushAsync();
        triggerPointsLoaded(0);

        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('failed to add deck layer "cloud"'),
            expect.any(Error),
        );
    });
});
