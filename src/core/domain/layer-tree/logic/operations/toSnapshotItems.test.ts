import { describe, expect, it } from "vitest";
import { toSnapshotItems } from "./toSnapshotItems";
import { layerNode, protocolBinding } from "../structure/__testFactories";
import { resolveStyle } from "../../../protocols";
import type { ProtocolRegistry, Protocol } from "@core/contracts";
import type {
    LayerStyle,
    RenderDescriptor,
    LayerAdapter,
} from "@core/contracts";

/** Creates a mock Protocol that returns a predictable RenderDescriptor. */
function mockProtocol(
    id: string,
    configTransform?: (
        sourceUrl: string,
        style: LayerStyle,
        params: Record<string, unknown>,
    ) => Record<string, unknown>,
    defaultStyle: LayerStyle = { paint: { "raster-opacity": 1 } },
): Protocol {
    return {
        id,
        label: id,
        defaultStyle,
        createRenderDescriptor(
            sourceUrl: string,
            style?: LayerStyle,
            _params: Record<string, unknown> = {},
        ): RenderDescriptor {
            const mergedStyle = resolveStyle(defaultStyle, style);
            const config = configTransform
                ? configTransform(sourceUrl, mergedStyle, _params)
                : { sourceUrl };
            return { sourceUrl, config };
        },
        getLayerAdapter(): LayerAdapter {
            return {} as unknown as LayerAdapter;
        },
    };
}

/** Creates a minimal ProtocolRegistry mock from a map of protocolId → Protocol. */
function mockRegistry(protocols: Record<string, Protocol>): ProtocolRegistry {
    return {
        getById(id: string): Protocol | undefined {
            return protocols[id];
        },
        register(): void {
            throw new Error("Not implemented in mock");
        },
        getAll(): Protocol[] {
            return Object.values(protocols);
        },
    } as unknown as ProtocolRegistry;
}

describe("toSnapshotItems", () => {
    const WMS_URL = "https://example.test/wms";
    const wmsProtocol = mockProtocol("wms", (url) => ({
        sourceUrl: url,
        opacity: 1,
    }));

    it("returns empty array for empty nodes", () => {
        const registry = mockRegistry({ wms: wmsProtocol });
        expect(toSnapshotItems([], registry)).toEqual([]);
    });

    it("converts all nodes when all protocols are registered", () => {
        const registry = mockRegistry({ wms: wmsProtocol });
        const nodes = [
            layerNode("1", {
                renderer: protocolBinding({
                    protocolId: "wms",
                    sourceUrl: "url1",
                }),
            }),
            layerNode("2", {
                renderer: protocolBinding({
                    protocolId: "wms",
                    sourceUrl: "url2",
                }),
            }),
        ];
        const result = toSnapshotItems(nodes, registry);
        expect(result).toHaveLength(2);
        expect(result[0]?.id).toBe("1");
        expect(result[0]?.protocolId).toBe("wms");
        expect(result[1]?.id).toBe("2");
    });

    it("skips nodes with unregistered protocol", () => {
        const registry = mockRegistry({ wms: wmsProtocol });
        const nodes = [
            layerNode("1", {
                renderer: protocolBinding({ protocolId: "wms" }),
            }),
            layerNode("2", {
                renderer: protocolBinding({ protocolId: "unknown" }),
            }),
            layerNode("3", {
                renderer: protocolBinding({ protocolId: "wms" }),
            }),
        ];
        const result = toSnapshotItems(nodes, registry);
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.id)).toEqual(["1", "3"]);
    });

    it("returns empty array when no protocol is registered", () => {
        const registry = mockRegistry({});
        const nodes = [
            layerNode("1", {
                renderer: protocolBinding({ protocolId: "wms" }),
            }),
        ];
        expect(toSnapshotItems(nodes, registry)).toEqual([]);
    });

    it("sets visible to false from node.isVisible", () => {
        const registry = mockRegistry({ wms: wmsProtocol });
        const nodes = [
            layerNode("1", {
                isVisible: false,
                renderer: protocolBinding({ protocolId: "wms" }),
            }),
        ];
        const result = toSnapshotItems(nodes, registry);
        expect(result).toHaveLength(1);
        expect(result[0]?.visible).toBe(false);
    });

    it("sets visible to true from node.isVisible", () => {
        const registry = mockRegistry({ wms: wmsProtocol });
        const nodes = [
            layerNode("1", {
                isVisible: true,
                renderer: protocolBinding({ protocolId: "wms" }),
            }),
        ];
        const result = toSnapshotItems(nodes, registry);
        expect(result).toHaveLength(1);
        expect(result[0]?.visible).toBe(true);
    });

    it("passes sourceUrl, style, and params to protocol.createRenderDescriptor", () => {
        const captured: Array<{
            url: string;
            style: LayerStyle;
            params: Record<string, unknown>;
        }> = [];
        const capturingProtocol = mockProtocol("wms", (url, style, params) => {
            captured.push({ url, style, params });
            return {};
        });
        const registry = mockRegistry({ wms: capturingProtocol });
        const nodes = [
            layerNode("1", {
                renderer: protocolBinding({
                    protocolId: "wms",
                    sourceUrl: "https://geo.example.com",
                    params: { layers: "test" },
                }),
                style: { paint: { "raster-opacity": 0.7 } },
            }),
        ];
        toSnapshotItems(nodes, registry);
        expect(captured).toHaveLength(1);
        expect(captured[0]?.url).toBe("https://geo.example.com");
        expect(captured[0]?.params).toEqual({ layers: "test" });
        expect(captured[0]?.style).toEqual({
            paint: { "raster-opacity": 0.7 },
        });
    });

    it("applies the protocol default style when the node has no style", () => {
        const protocol = mockProtocol(
            "wms",
            (_url, style) => ({
                opacity: style.paint?.["raster-opacity"],
            }),
            { paint: { "raster-opacity": 1 } },
        );
        const registry = mockRegistry({ wms: protocol });
        const node = layerNode("1", {
            renderer: protocolBinding({ protocolId: "wms" }),
        });
        delete node.style;
        const result = toSnapshotItems([node], registry);
        expect(result[0]?.descriptor.config).toEqual({ opacity: 1 });
    });

    it("node style overrides the protocol default style", () => {
        const protocol = mockProtocol(
            "wms",
            (_url, style) => ({
                opacity: style.paint?.["raster-opacity"],
            }),
            { paint: { "raster-opacity": 1 } },
        );
        const registry = mockRegistry({ wms: protocol });
        const nodes = [
            layerNode("1", {
                renderer: protocolBinding({ protocolId: "wms" }),
                style: { paint: { "raster-opacity": 0.3 } },
            }),
        ];
        const result = toSnapshotItems(nodes, registry);
        expect(result[0]?.descriptor.config).toEqual({ opacity: 0.3 });
    });

    it.each([
        ["the protocol is not registered", { protocolId: "nope", sourceUrl: WMS_URL }],
        ["the resolved sourceUrl is empty", { protocolId: "wms", sourceUrl: "" }],
    ])("excludes a node silently when %s", (_label, renderer) => {
        const registry = mockRegistry({ wms: wmsProtocol });
        const nodes = [layerNode("1", { renderer: protocolBinding(renderer) })];
        expect(toSnapshotItems(nodes, registry)).toEqual([]);
    });

    it("keeps a node whose descriptor resolves to a non-empty URL", () => {
        const registry = mockRegistry({ wms: wmsProtocol });
        const nodes = [
            layerNode("1", {
                renderer: protocolBinding({
                    protocolId: "wms",
                    sourceUrl: WMS_URL,
                }),
            }),
        ];
        const result = toSnapshotItems(nodes, registry);
        expect(result).toHaveLength(1);
        expect(result[0]?.descriptor.sourceUrl).toBe(
            WMS_URL,
        );
    });

    it("does not mutate the input array", () => {
        const registry = mockRegistry({ wms: wmsProtocol });
        const nodes = [
            layerNode("1", {
                renderer: protocolBinding({ protocolId: "wms" }),
            }),
        ];
        const frozen = [...nodes];
        toSnapshotItems(nodes, registry);
        expect(nodes).toEqual(frozen);
    });
});
