import { describe, expect, it, vi } from "vitest";
import { LayerTreeStore } from "./LayerTreeStore";
import type { StoreRegistry } from "@core/store-registry";
import type { SourceAdapter, TreeNode } from "@core/contracts";
import { LayerTreeNodeTypes } from "@core/contracts";
import { Bbox } from "@core/lib/geo";

const createStore = () =>
    new LayerTreeStore({
        settingsStore: { getStringSetting: () => undefined },
    } as unknown as StoreRegistry);

const ERROR_MESSAGE = "Failed to initialize";

const EMPTY_GROUP_ID = "empty-group";

/** Group fixture without children — the adapter delivers them separately. */
const groupNode = (id: string): TreeNode => ({
    id,
    type: LayerTreeNodeTypes.Group,
    title: id,
    description: "",
    parentId: null,
    bbox: null,
    isVisible: false,
    relatedObjects: [],
    childrenIds: [],
    childrenCount: 0,
});

const layerNode = (id: string): TreeNode => ({
    id,
    type: LayerTreeNodeTypes.Layer,
    title: id,
    description: "",
    parentId: null,
    bbox: null,
    isVisible: false,
    relatedObjects: [],
    renderer: { protocolId: "wms", sourceUrl: "https://example.test/wms", params: {} },
    capabilities: [],
});

/**
 * Store with a stub source adapter. `rootBatches` are served by `fetchRoot`
 * in order; `childrenByGroup` maps group ids to their child batches.
 */
function createTreeStore(
    rootBatches: TreeNode[][],
    childrenByGroup: Record<string, TreeNode[]>,
): { store: LayerTreeStore; fetchChildren: ReturnType<typeof vi.fn> } {
    const fetchChildren = vi.fn((parent: TreeNode) =>
        Promise.resolve(childrenByGroup[parent.id] ?? []),
    );
    let rootCall = 0;
    const adapter: SourceAdapter = {
        type: "stub",
        fetchRoot: () =>
            Promise.resolve(rootBatches[Math.min(rootCall++, rootBatches.length - 1)]!),
        fetchChildren,
        initialize: () => undefined,
        dispose: () => undefined,
    };
    const store = new LayerTreeStore({
        settingsStore: { getStringSetting: () => undefined },
        sourceAdapterFactory: {
            get: () => adapter,
        },
    } as unknown as StoreRegistry);
    store.initAdapter("stub");
    return { store, fetchChildren };
}

describe("LayerTreeStore render errors", () => {
    it("returns undefined for a node without a render error", () => {
        const store = createStore();
        expect(store.getRenderError("cloud")).toBeUndefined();
    });

    it("marks every node id of a failed render unit with the same message", () => {
        const store = createStore();
        store.reportRenderError(["a", "b"], ERROR_MESSAGE);

        expect(store.getRenderError("a")).toBe(ERROR_MESSAGE);
        expect(store.getRenderError("b")).toBe(ERROR_MESSAGE);
    });

    it("clears errors for the node ids of a successfully re-added unit", () => {
        const store = createStore();
        store.reportRenderError(["a", "b"], ERROR_MESSAGE);
        store.reportRenderError(["a", "b"], null);

        expect(store.getRenderError("a")).toBeUndefined();
        expect(store.getRenderError("b")).toBeUndefined();
    });

    it("clears only the reported node ids", () => {
        const store = createStore();
        store.reportRenderError(["a", "b"], "boom");
        store.reportRenderError(["b"], null);

        expect(store.getRenderError("a")).toBe("boom");
        expect(store.getRenderError("b")).toBeUndefined();
    });
});

describe("LayerTreeStore zoom extent", () => {
    const OWN: Bbox = Bbox.fromCorners({
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 1,
        maxY: 1,
        maxZ: 1,
    });
    const CHILD: Bbox = Bbox.fromCorners({
        minX: 10,
        minY: 10,
        minZ: 0,
        maxX: 11,
        maxY: 11,
        maxZ: 1,
    });

    /** A loaded group with one visible, bbox-carrying child layer. */
    async function storeWithChild(groupBbox: Bbox | null) {
        const group = { ...groupNode("group"), bbox: groupBbox };
        const child = {
            ...layerNode("child"),
            bbox: CHILD,
            isVisible: true,
        };
        const { store } = createTreeStore([[group]], {
            group: [child],
        });
        await store.refresh();
        await store.ensureChildrenLoaded("group");
        return store;
    }

    it("a group's own bbox wins over its children's extent", async () => {
        const store = await storeWithChild(OWN);

        expect(store.getZoomExtent("group")).toBe(OWN);
    });

    it("without an own bbox a group zooms to its children", async () => {
        const store = await storeWithChild(null);

        expect(store.getZoomExtent("group")).toEqual(CHILD);
    });

    it("an empty group without a bbox has nothing to zoom to", () => {
        const store = createStore();

        expect(store.getZoomExtent("group")).toBeNull();
    });

    it("an unknown id resolves to nothing", () => {
        const store = createStore();

        expect(store.getZoomExtent("ghost")).toBeNull();
    });

    it("a layer zooms to its own bbox alone", async () => {
        const { store } = createTreeStore(
            [[{ ...layerNode("plain"), bbox: OWN }]],
            {},
        );
        await store.refresh();

        expect(store.getZoomExtent("plain")).toBe(OWN);
    });

    it("a layer without a bbox has nothing to zoom to", async () => {
        const { store } = createTreeStore([[layerNode("plain")]], {});
        await store.refresh();

        expect(store.getZoomExtent("plain")).toBeNull();
    });
});

describe("LayerTreeStore disposal", () => {
    it("calling dispose twice is safe", () => {
        const store = createStore();

        expect(() => {
            store.dispose();
            store.dispose();
        }).not.toThrow();
    });
});

describe("LayerTreeStore lazy loading", () => {
    it("an empty group loads once — re-expansion does not re-fetch", async () => {
        const { store, fetchChildren } = createTreeStore(
            [[groupNode(EMPTY_GROUP_ID)]],
            {},
        );
        await store.refresh();

        await store.ensureChildrenLoaded(EMPTY_GROUP_ID);
        await store.ensureChildrenLoaded(EMPTY_GROUP_ID);

        expect(fetchChildren).toHaveBeenCalledTimes(1);
    });

    it("a loaded non-empty group is not fetched again", async () => {
        const { store, fetchChildren } = createTreeStore(
            [[groupNode("group")]],
            { group: [layerNode("layer-1")] },
        );
        await store.refresh();

        await store.ensureChildrenLoaded("group");
        await store.ensureChildrenLoaded("group");

        expect(fetchChildren).toHaveBeenCalledTimes(1);
    });

    it("a manual refresh re-fetches an already-loaded empty group", async () => {
        const { store, fetchChildren } = createTreeStore(
            [[groupNode(EMPTY_GROUP_ID)]],
            {},
        );
        await store.refresh();
        await store.ensureChildrenLoaded(EMPTY_GROUP_ID);

        await store.refresh(EMPTY_GROUP_ID);

        expect(fetchChildren).toHaveBeenCalledTimes(2);
    });

    it("a group removed by a later reconcile starts unloaded again", async () => {
        const { store, fetchChildren } = createTreeStore(
            [[groupNode("group")], [], [groupNode("group")]],
            { group: [] },
        );
        await store.refresh(); // batch 1: group present
        await store.ensureChildrenLoaded("group");
        expect(fetchChildren).toHaveBeenCalledTimes(1);

        await store.refresh(); // batch 2: group removed
        await store.refresh(); // batch 3: same id re-added
        await store.ensureChildrenLoaded("group");

        expect(fetchChildren).toHaveBeenCalledTimes(2);
    });

    it("layer ids and unknown ids resolve without any fetch", async () => {
        const { store, fetchChildren } = createTreeStore(
            [[layerNode("plain-layer")]],
            {},
        );
        await store.refresh();

        await store.ensureChildrenLoaded("plain-layer");
        await store.ensureChildrenLoaded("unknown");

        expect(fetchChildren).not.toHaveBeenCalled();
    });
});

describe("LayerTreeStore reload freshness", () => {
    function deferred<T>() {
        let resolve!: (value: T) => void;
        const promise = new Promise<T>((r) => {
            resolve = r;
        });
        return { promise, resolve };
    }

    function stubAdapter(
        fetchRoot: () => Promise<TreeNode[]>,
        fetchChildren: (parent: TreeNode) => Promise<TreeNode[]> = () =>
            Promise.resolve([]),
    ): SourceAdapter {
        return {
            type: "stub",
            fetchRoot,
            fetchChildren,
            initialize: () => undefined,
            dispose: () => undefined,
        };
    }

    function storeWithFactory(
        get: () => SourceAdapter | undefined,
    ): LayerTreeStore {
        const store = new LayerTreeStore({
            settingsStore: { getStringSetting: () => undefined },
            sourceAdapterFactory: { get },
        } as unknown as StoreRegistry);
        store.initAdapter("stub");
        return store;
    }

    it("a superseded root refresh does not overwrite the newer tree", async () => {
        const slow = deferred<TreeNode[]>();
        let call = 0;
        const adapter = stubAdapter(
            () =>
                call++ === 0
                    ? slow.promise
                    : Promise.resolve([layerNode("fresh")]),
        );
        const store = storeWithFactory(() => adapter);

        const stale = store.refresh();
        const fresh = store.refresh();
        await fresh;

        slow.resolve([layerNode("stale")]);
        await stale;

        expect(store.rootNodes.map((n) => n.id)).toEqual(["fresh"]);
    });

    it("a response from a replaced adapter is not applied to the tree", async () => {
        const pending = deferred<TreeNode[]>();
        const staleAdapter = stubAdapter(() => pending.promise);
        const nextAdapter = stubAdapter(() =>
            Promise.resolve([layerNode("next")]),
        );
        const adapters = [staleAdapter, nextAdapter];
        let factoryCall = 0;
        const store = storeWithFactory(
            () => adapters[Math.min(factoryCall++, adapters.length - 1)]!,
        );

        const stale = store.refresh();
        store.initAdapter("stub");
        pending.resolve([layerNode("stale")]);
        await stale;

        expect(store.rootNodes).toEqual([]);
    });

    it("a superseded group refresh does not overwrite the newer children", async () => {
        const slow = deferred<TreeNode[]>();
        let call = 0;
        const adapter = stubAdapter(
            () => Promise.resolve([groupNode("group")]),
            () =>
                call++ === 0
                    ? slow.promise
                    : Promise.resolve([layerNode("fresh-child")]),
        );
        const store = storeWithFactory(() => adapter);
        await store.refresh();

        const stale = store.refresh("group");
        const fresh = store.refresh("group");
        await fresh;

        slow.resolve([layerNode("stale-child")]);
        await stale;

        expect(store.childrenOf("group").map((n) => n.id)).toEqual([
            "fresh-child",
        ]);
    });
});
