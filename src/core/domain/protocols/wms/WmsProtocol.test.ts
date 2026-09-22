import { describe, expect, it } from "vitest";
import type { RenderUnit } from "@core/contracts";
import { WmsProtocol } from "./WmsProtocol";

const adapterStub = {
    nativeLayerOrdering: true,
    addToMap: () => undefined,
    removeFromMap: () => undefined,
    updateVisibility: () => undefined,
    updateConfig: () => undefined,
} as unknown as RenderUnit["adapter"];

function wmsUnit(id: string, layers: string, styles: string): RenderUnit {
    const url = "https://wms.example.test/wms";
    return {
        id,
        nodeIds: [id],
        protocolId: "wms",
        adapter: adapterStub,
        descriptor: {
            sourceUrl: url,
            config: {
                type: "wms",
                url,
                layers,
                styles,
                version: "1.3.0",
                opacity: 1.0,
            },
        },
    };
}

describe("WmsProtocol.groupRenderUnits — grouped tile URL", () => {
    it("lists LAYERS/STYLES in reverse node order", () => {
        // The map's z-order for grouped WMS relies on this: nodeIds arrive in
        // tree (snapshot) order, the tile URL lists them reversed.
        const protocol = new WmsProtocol();
        const units = new Map([
            ["a", wmsUnit("a", "LA", "SA")],
            ["b", wmsUnit("b", "LB", "SB")],
            ["c", wmsUnit("c", "LC", "SC")],
        ]);

        protocol.groupRenderUnits(units);

        expect(units.size).toBe(1);
        const group = [...units.values()][0]!;
        expect(group.nodeIds).toEqual(["a", "b", "c"]);

        const params = new URL(group.descriptor.sourceUrl).searchParams;
        expect(params.get("LAYERS")).toBe("LC,LB,LA");
        expect(params.get("STYLES")).toBe("SC,SB,SA");
        expect(params.get("VERSION")).toBe("1.3.0");
    });

    it("keeps a single unit unmerged when no key match is possible", () => {
        const protocol = new WmsProtocol();
        const units = new Map([["a", wmsUnit("a", "LA", "SA")]]);

        protocol.groupRenderUnits(units);

        expect(units.size).toBe(1);
        const group = [...units.values()][0]!;
        const params = new URL(group.descriptor.sourceUrl).searchParams;
        expect(params.get("LAYERS")).toBe("LA");
    });

    it("builds the descriptor from a clean endpoint and params", () => {
        const protocol = new WmsProtocol();

        const descriptor = protocol.createRenderDescriptor(
            "https://wms.example.test/service",
            undefined,
            { layers: "roads", version: "1.1.1" },
        );

        expect(descriptor.config.url).toBe(
            "https://wms.example.test/service",
        );
        expect(descriptor.config.layers).toBe("roads");
        expect(descriptor.config.version).toBe("1.1.1");
        const query = new URL(descriptor.sourceUrl).searchParams;
        expect(query.get("LAYERS")).toBe("roads");
        expect(query.get("VERSION")).toBe("1.1.1");
    });
});
