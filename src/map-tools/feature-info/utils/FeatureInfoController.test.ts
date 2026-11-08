import { afterEach, describe, expect, it, vi } from "vitest";
import { FeatureInfoController } from "./FeatureInfoController";
import type { FeatureInfoAttachDeps } from "./FeatureInfoController";
import { FeatureInfoStore } from "./FeatureInfoStore";
import { showClickMarker } from "./clickMarker";
import type { Feature } from "@core/contracts";

afterEach(() => {
    vi.clearAllMocks();
});

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

type Provider = { collect: (params: unknown) => Promise<Feature[]> };

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

    it("a remount between activation and result keeps the collection alive", async () => {
        const settle: { resolve: (features: Feature[]) => void } = {
            resolve: () => {},
        };
        const provider: Provider = {
            collect: () =>
                new Promise<Feature[]>((resolve) => {
                    settle.resolve = resolve;
                }),
        };
        const { controller, store, deps } = makeDeps(provider, POINT);

        controller.attach(deps);
        // The transient unmount/remount React dev mode runs between an
        // activation and its result.
        controller.detach();
        controller.attach(deps);

        settle.resolve([]);
        await vi.waitFor(() => expect(store.loading).toBe(false));

        expect(showClickMarker).toHaveBeenCalledTimes(2);
    });
});
