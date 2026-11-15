import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeAutoObservable, runInAction } from "mobx";
import type maplibregl from "maplibre-gl";
import type { LayerAdapter, SnapshotItem } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import { MapStore } from "./MapStore";

vi.mock("../adapters/overlay", () => ({
    DeckOverlayManager: class {
        attachToMap = vi.fn();
        detachFromMap = vi.fn();
    },
}));

function fakeMap(): maplibregl.Map {
    return {
        loaded: () => true,
        on: vi.fn(),
        off: vi.fn(),
        getLayer: () => undefined,
        moveLayer: vi.fn(),
    } as unknown as maplibregl.Map;
}

function snapshotItem(id: string): SnapshotItem {
    return {
        id,
        visible: true,
        protocolId: "test",
        descriptor: { sourceUrl: `https://example.com/${id}`, config: {} },
    };
}

interface Harness {
    store: MapStore;
    treeStore: {
        layerSnapshot: SnapshotItem[];
        reportRenderError: ReturnType<typeof vi.fn>;
    };
    addToMap: ReturnType<typeof vi.fn>;
}

/** Real LayerManager inside the store — the error channel is the subject. */
function harness(): Harness {
    const addToMap = vi.fn();
    const fullAdapter: LayerAdapter = {
        nativeLayerOrdering: false,
        addToMap,
        removeFromMap: vi.fn(),
        updateVisibility: vi.fn(),
        updateConfig: vi.fn(),
    };

    const treeStore = makeAutoObservable(
        {
            layerSnapshot: [] as SnapshotItem[],
            reportRenderError: vi.fn(),
        },
        { reportRenderError: false },
    );
    const protocol = { getLayerAdapter: () => fullAdapter };
    const rootStore = {
        treeStore,
        protocolRegistry: {
            getById: () => protocol,
            getAll: () => [protocol],
        },
        mapToolStore: { onMapChanged: vi.fn() },
    } as unknown as StoreRegistry;

    const store = new MapStore(rootStore);
    store.setMap(fakeMap());

    return { store, treeStore: treeStore as Harness["treeStore"], addToMap };
}

describe("MapStore context", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("exposes no context until a map arrives", () => {
        const store = new MapStore({} as StoreRegistry);

        expect(store.context).toBeNull();
    });

    it("exposes the map and a callable reportLayerError once set", () => {
        const { store } = harness();
        const context = store.context!;

        expect(context.map).toBe(store.getMap());
        expect(context.overlayManager).toBeDefined();
        expect(typeof context.reportLayerError).toBe("function");
    });
});

describe("MapStore render-error channel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("routes a reported failure to the per-node errors of its nodes", () => {
        const { store, treeStore } = harness();
        runInAction(() => {
            treeStore.layerSnapshot = [snapshotItem("A")];
        });
        expect(treeStore.reportRenderError).toHaveBeenCalledWith(["A"], null);

        store.context!.reportLayerError!("A", new Error("tile boom"));

        expect(treeStore.reportRenderError).toHaveBeenLastCalledWith(
            ["A"],
            "tile boom",
        );
    });

    it("a late report for an unknown unit mutates nothing", () => {
        const { store, treeStore } = harness();

        store.context!.reportLayerError!("ghost", new Error("boom"));

        expect(treeStore.reportRenderError).not.toHaveBeenCalledWith(
            ["ghost"],
            "boom",
        );
    });
});
