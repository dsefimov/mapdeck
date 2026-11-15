import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
    AssetMappingPort,
    ProtocolBinding,
} from "@core/contracts";
import type { STACCollection, STACItem } from "../types";
import { STACCache } from "../core/STACCache";
import type { CapabilitySource } from "./capabilities";
import { STACEntityMapper } from "./STACEntityMapper";

const mapAssetsMock = vi.hoisted(() => vi.fn());

const emptyCapabilitySource: CapabilitySource = {
    linkedToolIds: () => [],
    hasLink: () => false,
};

function makeMapper(): STACEntityMapper {
    return new STACEntityMapper(
        new STACCache(),
        { mapAssets: mapAssetsMock } as unknown as AssetMappingPort,
        emptyCapabilitySource,
    );
}

function collection(overrides: Partial<STACCollection> = {}): STACCollection {
    return {
        id: "col-1",
        type: "Collection",
        stac_version: "1.0.0",
        description: "A collection",
        links: [{ rel: "child", href: "./child" }],
        ...overrides,
    };
}

describe("mapCollectionToGroupNode bbox handling", () => {
    it("maps a collection without extent to a node with no bbox", () => {
        const node = makeMapper().mapCollectionToGroupNode(collection());

        expect(node.bbox).toBeNull();
        expect(node.id).toBe("col-1");
        expect(node.title).toBe("col-1");
    });

    it("maps a collection whose spatial bbox array is empty", () => {
        const node = makeMapper().mapCollectionToGroupNode(
            collection({ extent: { spatial: { bbox: [] } } }),
        );

        expect(node.bbox).toBeNull();
    });

    it("keeps a 2D extent as the node bbox", () => {
        const node = makeMapper().mapCollectionToGroupNode(
            collection({ extent: { spatial: { bbox: [[10, 20, 30, 40]] } } }),
        );

        expect(node.bbox?.west).toBe(10);
        expect(node.bbox?.south).toBe(20);
        expect(node.bbox?.east).toBe(30);
        expect(node.bbox?.north).toBe(40);
    });

    it("flattens a 3D extent to 2D", () => {
        const node = makeMapper().mapCollectionToGroupNode(
            collection({
                extent: { spatial: { bbox: [[10, 20, 0, 30, 40, 5]] } },
            }),
        );

        expect(node.bbox?.west).toBe(10);
        expect(node.bbox?.south).toBe(20);
        expect(node.bbox?.east).toBe(30);
        expect(node.bbox?.north).toBe(40);
        expect(node.bbox?.minZ).toBeUndefined();
    });
});

function item(bbox: readonly number[]): STACItem {
    return {
        stac_version: "1.0.0",
        type: "Feature",
        id: "item-1",
        bbox,
        properties: {},
        assets: {},
    };
}

describe("mapItemToLayerNode bbox handling", () => {
    beforeEach(() => {
        const binding: ProtocolBinding = {
            protocolId: "xyz",
            sourceUrl: "https://tiles.test/{z}/{x}/{y}",
            params: {},
        };
        mapAssetsMock.mockReset();
        mapAssetsMock.mockReturnValue({
            renderer: binding,
            relatedObjects: [],
        });
    });

    it("maps a degenerate item bbox to no bbox", () => {
        const node = makeMapper().mapItemToLayerNode(item([1, 2, 3]));

        expect(node).not.toBeNull();
        expect(node?.bbox).toBeNull();
    });

    it("keeps a valid item bbox", () => {
        const node = makeMapper().mapItemToLayerNode(item([1, 2, 3, 4]));

        expect(node?.bbox?.west).toBe(1);
        expect(node?.bbox?.north).toBe(4);
    });
});
