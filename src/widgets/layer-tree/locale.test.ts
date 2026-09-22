import { describe, expect, it } from "vitest";
import { resolveRenderer } from "@core/domain/layer-tree";
import {
    LayerTreeNodeTypes,
    type LayerAdapter,
    type LayerNode,
    type Protocol,
    type ProtocolRegistry,
} from "@core/contracts";
import { layerTreeTranslations } from "./locale";

const node: LayerNode = {
    id: "layer-1",
    type: LayerTreeNodeTypes.Layer,
    title: "Layer 1",
    description: "",
    parentId: null,
    bbox: null,
    isVisible: true,
    renderer: {
        protocolId: "stub",
        sourceUrl: "https://example.com/data",
        params: {},
    },
    capabilities: [],
    style: {},
    relatedObjects: [],
};

const emptySourceUrlProtocol: Protocol = {
    id: "stub",
    label: "Stub",
    defaultStyle: {},
    createRenderDescriptor: () => ({ sourceUrl: "", config: {} }),
    // Never reached: resolveRenderer stops at the descriptor's empty sourceUrl.
    getLayerAdapter: () => ({}) as LayerAdapter,
};

function registryWith(protocol: Protocol | undefined): ProtocolRegistry {
    return {
        getById: () => protocol,
        getAll: () => (protocol ? [protocol] : []),
    };
}

// Widget.tsx builds these keys as `unsupported.${reason}` — a dynamic lookup
// the compiler cannot check, so every RendererBlocker is pinned to the locale.
describe("unsupported locale keys cover every RendererBlocker", () => {
    it.each([
        ["an unregistered protocol", undefined],
        ["a protocol with an empty source URL", emptySourceUrlProtocol],
    ] as const)("%s has a non-empty locale message", (_scenario, protocol) => {
        const resolution = resolveRenderer(node, registryWith(protocol));
        expect(resolution.renderable).toBe(false);
        if (resolution.renderable) return;

        expect(
            layerTreeTranslations.en?.[`unsupported.${resolution.reason}`],
        ).toBeTruthy();
    });
});
