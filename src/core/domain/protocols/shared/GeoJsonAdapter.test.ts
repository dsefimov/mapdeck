import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@core/lib/logger";
import type {
    MapContext,
    RenderDescriptor,
} from "@core/contracts";

vi.mock("@deck.gl/layers", () => ({ GeoJsonLayer: class {} }));
vi.mock("@core/ui/theme", () => ({ DEFAULT_ACCENT_CSS: "#112233" }));

import { GeoJsonAdapter } from "./GeoJsonAdapter";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

interface CtxStub {
    ctx: MapContext;
    map: {
        on: ReturnType<typeof vi.fn>;
        off: ReturnType<typeof vi.fn>;
        getZoom: () => number;
        getBounds: () => {
            getWest: () => number;
            getSouth: () => number;
            getEast: () => number;
            getNorth: () => number;
        };
    };
    overlayManager: { updateLayer: ReturnType<typeof vi.fn> };
}

function ctxStub(): CtxStub {
    const map = {
        on: vi.fn(),
        off: vi.fn(),
        getZoom: (): number => 5,
        getBounds: () => ({
            getWest: () => 0,
            getSouth: () => 0,
            getEast: () => 1,
            getNorth: () => 1,
        }),
    };
    const overlayManager = {
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
        updateLayer: vi.fn(),
    };
    return {
        ctx: { map, overlayManager } as unknown as MapContext,
        map,
        overlayManager,
    };
}

function descriptorFor(name: string): RenderDescriptor {
    return {
        sourceUrl: `https://example.com/${name}.geojson`,
        config: {},
    } as unknown as RenderDescriptor;
}

describe("GeoJsonAdapter moveend listener ownership", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: true, json: async () => EMPTY_FC })),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("detaches the shared moveend listener only when the last layer leaves", () => {
        const { ctx, map } = ctxStub();
        const adapter = new GeoJsonAdapter();

        adapter.addToMap("a", descriptorFor("a"), ctx);
        adapter.addToMap("b", descriptorFor("b"), ctx);

        adapter.removeFromMap("a", ctx);
        expect(map.off).not.toHaveBeenCalled();

        adapter.removeFromMap("b", ctx);
        expect(map.off).toHaveBeenCalledTimes(1);
        expect(map.off).toHaveBeenCalledWith(
            "moveend",
            expect.any(Function),
        );
    });

    it("registers the shared moveend listener once regardless of layer count", () => {
        const { ctx, map } = ctxStub();
        const adapter = new GeoJsonAdapter();

        adapter.addToMap("a", descriptorFor("a"), ctx);
        adapter.addToMap("b", descriptorFor("b"), ctx);
        adapter.addToMap("c", descriptorFor("c"), ctx);

        expect(map.on).toHaveBeenCalledTimes(1);
        expect(map.on).toHaveBeenCalledWith("moveend", expect.any(Function));
    });

    it("re-registers the listener after the last layer is removed and re-added", () => {
        const { ctx, map } = ctxStub();
        const adapter = new GeoJsonAdapter();

        adapter.addToMap("a", descriptorFor("a"), ctx);
        adapter.removeFromMap("a", ctx);
        adapter.addToMap("a", descriptorFor("a"), ctx);

        expect(map.off).toHaveBeenCalledTimes(1);
        expect(map.on).toHaveBeenCalledTimes(2);
    });

    it("leaves an unknown layer id untouched", () => {
        const { ctx, map } = ctxStub();
        const adapter = new GeoJsonAdapter();

        adapter.addToMap("a", descriptorFor("a"), ctx);
        adapter.removeFromMap("nope", ctx);

        expect(map.off).not.toHaveBeenCalled();
    });

    it("serves every surviving layer from the one shared handler", async () => {
        let currentZoom = 5;
        const { ctx, map, overlayManager } = ctxStub();
        map.getZoom = () => currentZoom;

        const adapter = new GeoJsonAdapter();
        adapter.addToMap("a", descriptorFor("a"), ctx);
        adapter.addToMap("b", descriptorFor("b"), ctx);
        await vi.waitFor(() =>
            expect(overlayManager.updateLayer).toHaveBeenCalledTimes(2),
        );
        overlayManager.updateLayer.mockClear();

        // The zoom bump invalidates the tile caches, so the handler's pass
        // re-fetches and re-renders both layers.
        currentZoom = 7;
        const registration = map.on.mock.calls.find(
            ([event]) => event === "moveend",
        );
        const handler = registration?.[1] as () => void;
        handler();

        await vi.waitFor(() =>
            expect(overlayManager.updateLayer).toHaveBeenCalledTimes(2),
        );
    });
});

describe("GeoJsonAdapter tile requests", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: true, json: async () => EMPTY_FC })),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("appends bbox/limit without breaking existing query parameters", async () => {
        const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
        const { ctx } = ctxStub();
        const adapter = new GeoJsonAdapter();

        adapter.addToMap(
            "a",
            {
                sourceUrl: "https://example.com/items?f=json&api-key=zzz",
                config: {},
            } as unknown as RenderDescriptor,
            ctx,
        );

        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const requested = new URL(
            fetchMock.mock.calls[0]![0] as string,
        );
        expect(requested.searchParams.get("f")).toBe("json");
        expect(requested.searchParams.get("api-key")).toBe("zzz");
        expect(requested.searchParams.get("bbox")).toMatch(/^\d/);
        expect(requested.searchParams.get("limit")).toBe("5000");
    });

    it("aborts in-flight tile requests when the layer is removed", async () => {
        const errorSpy = vi
            .spyOn(logger, "warn")
            .mockImplementation(() => {});
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (_url: string, init?: { signal?: AbortSignal }) =>
                    new Promise((_resolve, reject) => {
                        init?.signal?.addEventListener("abort", () =>
                            reject(new Error("Aborted")),
                        );
                    }),
            ),
        );
        const { ctx } = ctxStub();
        const adapter = new GeoJsonAdapter();

        adapter.addToMap("a", descriptorFor("a"), ctx);
        await vi.waitFor(() =>
            expect(fetch).toHaveBeenCalledTimes(1),
        );

        adapter.removeFromMap("a", ctx);

        await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
        // The rejection surfaces as the adapter's own warn log — nothing else.
        expect(errorSpy.mock.calls[0]?.[0]).toContain("failed to fetch tile");
    });

    it("discards a superseded batch instead of double-merging its tiles", async () => {
        const idlessFc = () => ({
            type: "FeatureCollection",
            features: [1, 2, 3].map(() => ({
                type: "Feature",
                geometry: null,
                properties: {},
            })),
        });
        const resolvers: Array<(data: unknown) => void> = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(
                () =>
                    new Promise((resolve) => {
                        resolvers.push((data) =>
                            resolve({ ok: true, json: async () => data }),
                        );
                    }),
            ),
        );
        const { ctx, map, overlayManager } = ctxStub();
        const adapter = new GeoJsonAdapter();

        adapter.addToMap("a", descriptorFor("a"), ctx);
        await vi.waitFor(() => expect(resolvers.length).toBe(1));

        // A second moveend at the same zoom quantum supersedes batch A and
        // refetches the same (still uncached) tile.
        const registration = map.on.mock.calls.find(
            ([event]) => event === "moveend",
        );
        (registration?.[1] as () => void)();
        await vi.waitFor(() => expect(resolvers.length).toBe(2));

        resolvers[0]!(idlessFc());
        resolvers[1]!(idlessFc());
        // Let both batch continuations settle before reading the last push.
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(overlayManager.updateLayer).toHaveBeenCalled();
        const lastUpdate = overlayManager.updateLayer.mock.calls.at(-1)!;
        const data = (lastUpdate[1] as { data: { features: unknown[] } })
            .data;
        // Id-less features have no dedup to save them — only the supersede
        // check keeps the batch from merging twice.
        expect(data.features).toHaveLength(3);
    });
});

describe("GeoJsonAdapter merged-collection ceiling", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn(async (url: string) => {
            const bbox = new URL(url).searchParams.get("bbox") ?? "";
            return {
                ok: true,
                json: async () => ({
                    type: "FeatureCollection",
                    features: [1, 2, 3].map((n) => ({
                        type: "Feature",
                        id: `${bbox}#${n}`,
                        geometry: null,
                        properties: {},
                    })),
                }),
            };
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function wideCtxStub(): ReturnType<typeof ctxStub> {
        const stub = ctxStub();
        stub.map.getZoom = () => 5; // zoom quantum 4
        stub.map.getBounds = () =>
            ({
                getWest: () => 0,
                getSouth: () => 0,
                getEast: () => 40,
                getNorth: () => 40,
            }) as never;
        return stub;
    }

    it("evicts the oldest tiles when the merge exceeds the ceiling", async () => {
        const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
        const { ctx, overlayManager } = wideCtxStub();
        const adapter = new GeoJsonAdapter(6);

        adapter.addToMap("a", descriptorFor("a"), ctx);

        await vi.waitFor(async () => {
            expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
        });
        await vi.waitFor(() => {
            expect(overlayManager.updateLayer).toHaveBeenCalled();
        });

        const lastUpdate = overlayManager.updateLayer.mock.calls.at(-1)!;
        const data = (lastUpdate[1] as { data: { features: { id: string }[] } })
            .data;

        const ids = data.features.map((f) => f.id);
        expect(ids.length).toBeLessThanOrEqual(6);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
