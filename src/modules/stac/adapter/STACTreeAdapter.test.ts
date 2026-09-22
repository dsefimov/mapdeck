import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TreeNode } from "@core/contracts";
import { LayerTreeNodeTypes } from "@core/contracts";
import { STACTreeAdapter } from "./STACTreeAdapter";

const clientMocks = vi.hoisted(() => ({
    fetchCatalog: vi.fn(),
    fetchEntity: vi.fn(),
    fetchItemsAll: vi.fn(),
    fetchCollections: vi.fn(),
}));

const mapperMocks = vi.hoisted(() => ({
    getSTACCollectionFromNode: vi.fn(),
    mapCollectionToGroupNode: vi.fn(),
    mapItemToLayerNode: vi.fn(),
}));

vi.mock("../core/STACClient", () => ({
    STACClient: class {
        fetchCatalog = clientMocks.fetchCatalog;
        fetchEntity = clientMocks.fetchEntity;
        fetchItemsAll = clientMocks.fetchItemsAll;
        fetchCollections = clientMocks.fetchCollections;
    },
}));

vi.mock("../mapping/STACEntityMapper", () => ({
    STACEntityMapper: class {
        getSTACCollectionFromNode = mapperMocks.getSTACCollectionFromNode;
        mapCollectionToGroupNode = mapperMocks.mapCollectionToGroupNode;
        mapItemToLayerNode = mapperMocks.mapItemToLayerNode;
    },
}));

const URL = "https://stac.example.com/catalog";

function groupNode(id: string): TreeNode {
    return {
        id,
        type: LayerTreeNodeTypes.Group,
        title: id,
        description: "",
        parentId: null,
        childrenIds: [],
        childrenCount: 0,
        bbox: null,
        isVisible: true,
        relatedObjects: [],
    } as TreeNode;
}

function layerNode(id: string): TreeNode {
    return { ...groupNode(id), type: LayerTreeNodeTypes.Layer } as TreeNode;
}

function catalogLink(rel: string, href: string): {
    rel: string;
    href: string;
} {
    return { rel, href };
}

/** A fresh adapter, initialized against the mocked client/mapper pair. */
function initializedAdapter(): STACTreeAdapter {
    const adapter = new STACTreeAdapter(
        {} as ConstructorParameters<typeof STACTreeAdapter>[0],
        {} as ConstructorParameters<typeof STACTreeAdapter>[1],
    );
    adapter.initialize({ url: URL });
    return adapter;
}

describe("STACTreeAdapter lifecycle", () => {
    it("refuses to fetch before initialize", async () => {
        const adapter = new STACTreeAdapter(
            {} as ConstructorParameters<typeof STACTreeAdapter>[0],
            {} as ConstructorParameters<typeof STACTreeAdapter>[1],
        );

        await expect(adapter.fetchRoot()).rejects.toThrow(
            /must be initialized/,
        );
    });

    it("requires a url in its configuration", () => {
        const adapter = new STACTreeAdapter(
            {} as ConstructorParameters<typeof STACTreeAdapter>[0],
            {} as ConstructorParameters<typeof STACTreeAdapter>[1],
        );

        expect(() => adapter.initialize({})).toThrow(/requires 'url'/);
    });
});

describe("STACTreeAdapter.fetchRoot", () => {
    beforeEach(() => {
        clientMocks.fetchCatalog.mockReset();
        clientMocks.fetchEntity.mockReset();
        clientMocks.fetchItemsAll.mockReset();
        clientMocks.fetchCollections.mockReset();
        mapperMocks.mapCollectionToGroupNode.mockReset();
        mapperMocks.mapItemToLayerNode.mockReset();
    });

    it("rethrows a catalog failure — a dead root must surface", async () => {
        clientMocks.fetchCatalog.mockRejectedValue(new Error("offline"));
        const adapter = initializedAdapter();

        await expect(adapter.fetchRoot()).rejects.toThrow("offline");
    });

    it("collects child collections behind child links", async () => {
        const collection = { type: "Collection", id: "col-1" };
        clientMocks.fetchCatalog.mockResolvedValue({
            id: "root",
            links: [catalogLink("child", `${URL}/col-1`)],
        });
        clientMocks.fetchEntity.mockResolvedValue(collection);
        mapperMocks.mapCollectionToGroupNode.mockReturnValue(
            groupNode("col-1"),
        );
        const adapter = initializedAdapter();

        const nodes = await adapter.fetchRoot();

        expect(nodes).toHaveLength(1);
        expect(nodes[0]!.id).toBe("col-1");
    });

    it("enriches a root listing of asset-less items through their self links", async () => {
        const fullItem = {
            type: "Feature",
            id: "thin",
            assets: { tiles: { href: "https://t/{z}/{x}/{y}.pbf" } },
        };
        clientMocks.fetchCatalog.mockResolvedValue({
            id: "root",
            links: [catalogLink("item", `${URL}/items`)],
        });
        clientMocks.fetchItemsAll.mockResolvedValue([
            {
                type: "Feature",
                id: "thin",
                links: [catalogLink("self", `${URL}/items/thin`)],
            },
        ]);
        clientMocks.fetchEntity.mockResolvedValue(fullItem);
        mapperMocks.mapItemToLayerNode.mockReturnValue(layerNode("thin"));
        const adapter = initializedAdapter();

        const nodes = await adapter.fetchRoot();

        expect(nodes.map((n) => n.id)).toEqual(["thin"]);
        // The mapper receives the item's full form, not the thin listing.
        expect(mapperMocks.mapItemToLayerNode).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "thin",
                assets: expect.anything(),
            }),
        );
    });

    it("renders one node for a collection listed both as a child link and via the API", async () => {
        clientMocks.fetchCatalog.mockResolvedValue({
            id: "root",
            links: [
                catalogLink("child", `${URL}/col-1`),
                catalogLink("collections", `${URL}/api`),
            ],
        });
        clientMocks.fetchEntity.mockResolvedValue({
            type: "Collection",
            id: "col-1",
        });
        clientMocks.fetchCollections.mockResolvedValue([
            { type: "Collection", id: "col-1" },
        ]);
        mapperMocks.mapCollectionToGroupNode.mockImplementation((c) =>
            groupNode(c.id),
        );
        const adapter = initializedAdapter();

        const nodes = await adapter.fetchRoot();

        expect(nodes.map((n) => n.id)).toEqual(["col-1"]);
    });
});

describe("STACTreeAdapter.fetchChildren", () => {
    beforeEach(() => {
        mapperMocks.getSTACCollectionFromNode.mockReset();
    });

    it("returns nothing for a non-group parent without touching the client", async () => {
        const adapter = initializedAdapter();

        await expect(adapter.fetchChildren(layerNode("item-1"))).resolves.toEqual(
            [],
        );
    });

    it("returns nothing when the parent's collection is unknown to the cache", async () => {
        mapperMocks.getSTACCollectionFromNode.mockReturnValue(undefined);
        const adapter = initializedAdapter();

        await expect(adapter.fetchChildren(groupNode("ghost"))).resolves.toEqual(
            [],
        );
    });

    it("degrades a failing child link to nothing and keeps the healthy one", async () => {
        const parent = groupNode("parent");
        mapperMocks.getSTACCollectionFromNode.mockReturnValue({
            id: "parent",
            links: [
                catalogLink("child", `${URL}/broken`),
                catalogLink("child", `${URL}/healthy`),
            ],
        });
        clientMocks.fetchEntity.mockImplementation(async (href: string) => {
            if (href.endsWith("broken")) throw new Error("502");
            return { type: "Collection", id: "healthy" };
        });
        mapperMocks.mapCollectionToGroupNode.mockImplementation(() =>
            groupNode("healthy"),
        );
        const adapter = initializedAdapter();

        const nodes = await adapter.fetchChildren(parent);

        expect(nodes.map((n) => n.id)).toEqual(["healthy"]);
    });

    it("returns nothing when every child link fails", async () => {
        mapperMocks.getSTACCollectionFromNode.mockReturnValue({
            id: "parent",
            links: [catalogLink("child", `${URL}/broken`)],
        });
        clientMocks.fetchEntity.mockRejectedValue(new Error("502"));
        const adapter = initializedAdapter();

        await expect(adapter.fetchChildren(groupNode("p"))).resolves.toEqual([]);
    });
});
