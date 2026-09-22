import { describe, expect, it } from "vitest";
import type { LayerNode, RenderDescriptor } from "@core/contracts";
import { LayerTreeNodeTypes } from "@core/contracts";
import type { ProtocolRegistry } from "@core/contracts";
import { resolveRenderer } from "./resolveRenderer";

const OK_DESCRIPTOR: RenderDescriptor = {
    sourceUrl: "https://example.com/wms",
    config: {},
};

/** Registry stub: only "wms" resolves; createRenderDescriptor mirrors the source URL. */
const registry = {
    getById: (protocolId: string) =>
        protocolId === "wms"
            ? {
                  createRenderDescriptor: (
                      sourceUrl: string,
                  ): RenderDescriptor => ({ ...OK_DESCRIPTOR, sourceUrl }),
              }
            : undefined,
} as unknown as ProtocolRegistry;

function layerNode(rendererOverrides: Partial<LayerNode["renderer"]> = {}): LayerNode {
    return {
        id: "node",
        type: LayerTreeNodeTypes.Layer,
        title: "node",
        description: "",
        parentId: null,
        bbox: null,
        isVisible: true,
        relatedObjects: [],
        renderer: {
            protocolId: "wms",
            sourceUrl: "https://example.com/wms",
            params: {},
            ...rendererOverrides,
        },
        capabilities: [],
    } as LayerNode;
}

describe("resolveRenderer", () => {
    it("resolves a renderable node to its descriptor", () => {
        const resolution = resolveRenderer(layerNode(), registry);

        expect(resolution).toMatchObject({
            renderable: true,
            descriptor: OK_DESCRIPTOR,
        });
    });

    it.each<[string, LayerNode]>([
        [
            "an unregistered protocol",
            layerNode({ protocolId: "ghost" }),
        ],
        ["an empty resolved source URL", layerNode({ sourceUrl: "" })],
    ])("blocks %s", (_case, node) => {
        const resolution = resolveRenderer(node, registry);

        expect(resolution.renderable).toBe(false);
        if (!resolution.renderable) {
            expect(resolution.reason).toBe(
                node.renderer.protocolId === "ghost"
                    ? "unregistered-protocol"
                    : "empty-source-url",
            );
        }
    });
});
