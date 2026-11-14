import { describe, expect, it } from "vitest";
import type { LayerNode, Protocol } from "@core/contracts";
import { selectableLayers } from "./selectableLayers";

function makeNode(id: string, protocolId: string, visible: boolean): LayerNode {
    return {
        id,
        title: id,
        isVisible: visible,
        renderer: { protocolId, sourceUrl: "", params: {} },
    } as unknown as LayerNode;
}

function makeProtocols(
    selectable: Record<string, boolean>,
): { getById(id: string): Protocol | undefined; getAll(): Protocol[] } {
    return {
        getById: (id: string) =>
            id in selectable
                ? ({
                      id,
                      featureSelection: selectable[id],
                  } as unknown as Protocol)
                : undefined,
        getAll: () => [],
    };
}

describe("selectableLayers", () => {
    it("keeps visible layers of protocols that declare featureSelection", () => {
        const nodes = [
            makeNode("photos", "geojson-tiled", true),
            makeNode("cloud", "copc", true),
            makeNode("raster", "wms", true),
            makeNode("hidden", "geojson-tiled", false),
            makeNode("unknown-proto", "custom", true),
        ];
        const protocols = makeProtocols({
            "geojson-tiled": true,
            copc: false,
            wms: false,
        });

        const result = selectableLayers(nodes, protocols);

        expect(result.map((node) => node.id)).toEqual(["photos"]);
    });
});
