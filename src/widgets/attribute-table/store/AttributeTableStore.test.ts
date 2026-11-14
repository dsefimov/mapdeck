import { configure } from "mobx";
import { describe, expect, it, vi } from "vitest";
import type { StoreRegistry } from "@core/store-registry";
import type {
    AttributeFetchResult,
    LayerNode,
} from "@core/contracts";
import { LayerTreeNodeTypes } from "@core/contracts";
import { StateStore } from "@core/lib/state";
import { AttributeTableStore } from "./AttributeTableStore";

// Reproduce production MobX strictness (src/app/mobxConfig.ts).
configure({ enforceActions: "always" });

const LAYER_ID = "layer-1";

const binding = {
    protocolId: "ogc-features",
    sourceUrl: "https://example.test/items",
    params: {},
};

function makeRoot(
    fetchAttributes: ReturnType<typeof vi.fn>,
): StoreRegistry {
    const layer = {
        id: LAYER_ID,
        title: "Layer 1",
        type: LayerTreeNodeTypes.Layer,
        renderer: binding,
        data: binding,
        capabilities: [],
    } as unknown as LayerNode;
    return {
        stateStore: new StateStore(),
        treeStore: {
            allLayerNodes: [layer],
            node: (id: string) => (id === LAYER_ID ? layer : undefined),
        },
        protocolRegistry: { getById: () => ({ fetchAttributes }) },
    } as unknown as StoreRegistry;
}

const result = (
    features: number,
    totalFeatures: number,
    idField: string | null = "id",
): AttributeFetchResult => ({
    features: Array.from({ length: features }, (_, i) =>
        idField ? { [idField]: `f${i}` } : { name: `row ${i}` },
    ),
    totalFeatures,
});

describe("AttributeTableStore error channel", () => {
    it("surfaces a failed initial fetch", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockRejectedValueOnce(new Error("boom"));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer(LAYER_ID);

        expect(store.error).toBe("boom");
        expect(store.loadedFeatures).toEqual([]);
    });

    it("clearError hides the error and keeps loaded data", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockResolvedValueOnce(result(1, 2));
        fetchAttributes.mockRejectedValueOnce(new Error("next page boom"));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer(LAYER_ID);
        await store.loadNextPage();

        expect(store.error).toBe("next page boom");
        expect(store.loadedFeatures).toHaveLength(1);

        store.clearError();

        expect(store.error).toBeNull();
        expect(store.loadedFeatures).toHaveLength(1);
    });

    it("recovers on refresh after a failed fetch (the Retry button path)", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockRejectedValueOnce(new Error("boom"));
        fetchAttributes.mockResolvedValueOnce(result(1, 1));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer(LAYER_ID);
        expect(store.error).toBe("boom");

        await store.refreshData();

        expect(store.error).toBeNull();
        expect(store.loadedFeatures).toHaveLength(1);
        expect(store.totalFeatures).toBe(1);
    });

    it("stays silent on the happy path", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockResolvedValue(result(1, 1));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer(LAYER_ID);

        expect(store.error).toBeNull();
        expect(store.loadedFeatures).toHaveLength(1);
    });
});

describe("AttributeTableStore selection", () => {
    const FIRST_ROW_KEY = "feature-f0";

    it("refreshData drops an index-based selection — keys re-target silently", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockResolvedValue(result(2, 2, null));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer(LAYER_ID);
        store.selectAllRows();
        expect(store.selectedRowIds.size).toBe(2);

        await store.refreshData();

        expect(store.selectedRowIds.size).toBe(0);
    });

    it("a failed refresh keeps the selection along with the previous data", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockResolvedValueOnce(result(2, 2, null));
        fetchAttributes.mockRejectedValueOnce(new Error("offline"));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer(LAYER_ID);
        store.selectAllRows();
        expect(store.selectedRowIds.size).toBe(2);

        await store.refreshData();

        expect(store.selectedRowIds.size).toBe(2);
        expect(store.error).toBe("offline");
    });

    it("a mixed page keeps stable keys and drops index keys on refresh", async () => {
        // Row 0 carries an id; row 1 does not — a page some() calls stable.
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockResolvedValue({
            features: [{ id: "f0" }, { name: "no-id" }],
            totalFeatures: 2,
        } as AttributeFetchResult);
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer(LAYER_ID);
        store.selectAllRows();
        expect(store.selectedRowIds).toEqual(
            new Set([FIRST_ROW_KEY, "row-1"]),
        );

        await store.refreshData();

        expect(store.selectedRowIds).toEqual(new Set([FIRST_ROW_KEY]));
    });

    it("pagination keeps index-keyed selections — loaded rows only append", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockResolvedValue(result(2, 4, null));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer(LAYER_ID);
        store.selectAllRows();
        expect(store.selectedRowIds.size).toBe(2);

        await store.loadNextPage();

        expect(store.selectedRowIds.size).toBe(2);
    });

    it("a stable-id selection survives refresh and sort", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockResolvedValue(result(2, 2));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer(LAYER_ID);
        store.selectAllRows();
        expect(store.selectedRowIds).toEqual(
            new Set([FIRST_ROW_KEY, "feature-f1"]),
        );

        await store.refreshData();

        expect(store.selectedRowIds.size).toBe(2);

        await store.setSort("id", "asc");

        expect(store.selectedRowIds.size).toBe(2);
    });

    it("toggles rows through the shared selection store", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockResolvedValue(result(2, 2));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer(LAYER_ID);
        const firstRow = store.loadedFeatures.at(0);
        expect(firstRow).toBeDefined();
        store.toggleRowSelection(firstRow!);
        expect(store.selectedRowIds).toEqual(new Set([FIRST_ROW_KEY]));

        store.toggleRowSelection(firstRow!);
        expect(store.selectedRowIds.size).toBe(0);
    });

    it("switching layers keeps each layer's own selection", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockResolvedValue(result(1, 1));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer(LAYER_ID);
        const firstRow = store.loadedFeatures.at(0);
        expect(firstRow).toBeDefined();
        store.toggleRowSelection(firstRow!);

        await store.selectLayer(null);

        expect(store.selectedRowIds.size).toBe(0);

        await store.selectLayer(LAYER_ID);

        expect(store.selectedRowIds).toEqual(new Set([FIRST_ROW_KEY]));
    });

    it("carries the pin-to-top flag into the selection column config", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockResolvedValue(result(1, 1));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        expect(store.selectionColumn).toBeUndefined();

        await store.selectLayer(LAYER_ID);
        expect(store.selectionColumn?.pinSelectedToTop).toBe(false);

        store.toggleSelectionPinnedToTop();
        expect(store.selectionPinnedToTop).toBe(true);
        expect(store.selectionColumn?.pinSelectedToTop).toBe(true);
    });
});
