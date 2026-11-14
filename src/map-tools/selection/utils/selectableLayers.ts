import type { LayerNode, ProtocolRegistry } from "@core/contracts";

/**
 * Visible layers whose render protocol declares `featureSelection` —
 * the target list of the selection tool. Raster and point-cloud
 * protocols do not declare it, so their layers never appear here.
 */
export function selectableLayers(
    nodes: readonly LayerNode[],
    protocols: ProtocolRegistry,
): LayerNode[] {
    return nodes.filter(
        (node) =>
            node.isVisible &&
            protocols.getById(node.renderer.protocolId)?.featureSelection ===
                true,
    );
}
