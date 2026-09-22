import type {
    LayerNode,
    ProtocolRegistry,
    RenderDescriptor,
} from "@core/contracts";

/** Why a layer node cannot render. */
export type RendererBlocker = "unregistered-protocol" | "empty-source-url";

/** Result of {@link resolveRenderer}: a render descriptor, or why rendering is blocked. */
export type RendererResolution =
    | { renderable: true; descriptor: RenderDescriptor }
    | { renderable: false; reason: RendererBlocker };

/**
 * The single renderability predicate for a layer node: its renderer protocol
 * must be registered and resolve to a descriptor with a source URL. The
 * snapshot filter and the tree's unsupported mark both apply it.
 */
export function resolveRenderer(
    node: LayerNode,
    registry: ProtocolRegistry,
): RendererResolution {
    const protocol = registry.getById(node.renderer.protocolId);
    if (!protocol) return { renderable: false, reason: "unregistered-protocol" };

    const descriptor = protocol.createRenderDescriptor(
        node.renderer.sourceUrl,
        node.style,
        node.renderer.params,
    );
    if (!descriptor.sourceUrl) return { renderable: false, reason: "empty-source-url" };

    return { renderable: true, descriptor };
}
