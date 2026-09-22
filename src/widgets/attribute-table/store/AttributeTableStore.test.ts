import { configure } from "mobx";
import { describe, expect, it, vi } from "vitest";
import type { StoreRegistry } from "@core/store-registry";
import type {
    AttributeFetchResult,
    LayerNode,
} from "@core/contracts";
import { LayerTreeNodeTypes } from "@core/contracts";
import { AttributeTableStore } from "./AttributeTableStore";

// Reproduce production MobX strictness (src/app/mobxConfig.ts).
configure({ enforceActions: "always" });

const binding = {
    protocolId: "ogc-features",
    sourceUrl: "https://example.test/items",
    params: {},
};

function makeRoot(
    fetchAttributes: ReturnType<typeof vi.fn>,
): StoreRegistry {
    const layer = {
        id: "layer-1",
        title: "Layer 1",
        type: LayerTreeNodeTypes.Layer,
        renderer: binding,
        data: binding,
        capabilities: [],
    } as unknown as LayerNode;
    return {
        treeStore: {
            allLayerNodes: [layer],
            node: (id: string) => (id === "layer-1" ? layer : undefined),
        },
        protocolRegistry: { getById: () => ({ fetchAttributes }) },
    } as unknown as StoreRegistry;
}

const result = (
    features: number,
    totalFeatures: number,
): AttributeFetchResult => ({
    features: Array.from({ length: features }, (_, i) => ({ id: `f${i}` })),
    totalFeatures,
});

describe("AttributeTableStore error channel", () => {
    it("surfaces a failed initial fetch", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockRejectedValueOnce(new Error("boom"));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer("layer-1");

        expect(store.error).toBe("boom");
        expect(store.loadedFeatures).toEqual([]);
    });

    it("clearError hides the error and keeps loaded data", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockResolvedValueOnce(result(1, 2));
        fetchAttributes.mockRejectedValueOnce(new Error("next page boom"));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer("layer-1");
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

        await store.selectLayer("layer-1");
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

        await store.selectLayer("layer-1");

        expect(store.error).toBeNull();
        expect(store.loadedFeatures).toHaveLength(1);
    });
});

describe("AttributeTableStore selection", () => {
    it("refreshData drops the row selection — ids are index-based", async () => {
        const fetchAttributes = vi.fn<() => Promise<AttributeFetchResult>>();
        fetchAttributes.mockResolvedValue(result(2, 2));
        const store = new AttributeTableStore(makeRoot(fetchAttributes));

        await store.selectLayer("layer-1");
        store.selectAllRows();
        expect(store.selectedRowIds.size).toBe(2);

        await store.refreshData();

        expect(store.selectedRowIds.size).toBe(0);
    });
});
