import { describe, expect, it, vi } from "vitest";
import { FeatureInfoController } from "./FeatureInfoController";
import type { FeatureInfoAttachDeps } from "./FeatureInfoController";
import { FeatureInfoStore } from "./FeatureInfoStore";

vi.mock("maplibre-gl", () => ({
    default: {
        LngLat: class {
            constructor(
                public lng: number,
                public lat: number,
            ) {}
        },
    },
}));

vi.mock("./clickMarker", () => ({
    showClickMarker: vi.fn(),
    removeClickMarker: vi.fn(),
}));

vi.mock("@deck.gl/layers", () => ({ ScatterplotLayer: class {} }));
vi.mock("@deck.gl/core", () => ({
    COORDINATE_SYSTEM: { LNGLAT: 1 },
}));

type Provider = { collect: (params: unknown) => Promise<never[]> };

function makeDeps(
    provider: Provider,
    pendingPoint: object | null = null,
): {
    controller: FeatureInfoController;
    store: FeatureInfoStore;
    deps: FeatureInfoAttachDeps;
} {
    const store = new FeatureInfoStore();
    let pending = pendingPoint;
    const deps = {
        map: { on: vi.fn(), off: vi.fn() },
        context: {
            featureProviders: { getAll: () => [provider] },
            layerTree: { allLayerNodes: [] },
            mapToolState: {
                get pendingPoint() {
                    return pending;
                },
                consumePendingPoint: () => {
                    const point = pending;
                    pending = null;
                    return point;
                },
            },
        },
        overlayManager: { isAttached: () => false },
        store,
    } as unknown as FeatureInfoAttachDeps;
    return { controller: new FeatureInfoController(), store, deps };
}

const POINT = {
    lngLat: { lng: 30, lat: 50 },
    screenPoint: { x: 100, y: 100 },
};

describe("FeatureInfoController", () => {
    it("consumes the activation point and starts collecting", () => {
        const provider: Provider = {
            collect: () => new Promise(() => {}),
        };
        const { controller, store, deps } = makeDeps(provider, POINT);

        controller.attach(deps);

        expect(store.hasClicked).toBe(true);
        expect(store.loading).toBe(true);
    });

    it("detach settles the loading flag of the collection it aborts", () => {
        const provider: Provider = {
            collect: () => new Promise(() => {}),
        };
        const { controller, store, deps } = makeDeps(provider, POINT);
        controller.attach(deps);
        expect(store.loading).toBe(true);

        controller.detach();

        expect(store.loading).toBe(false);
    });
});
