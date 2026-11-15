import type {
    LayerNode,
    ProtocolRegistry,
    SnapshotItem,
} from "@core/contracts";
import { resolveRenderer } from "./resolveRenderer";

/** Visible layers with resolvable renderers → snapshot items. Unrenderable nodes are excluded. Returns new array. */
export function toSnapshotItems(
    nodes: readonly LayerNode[],
    registry: ProtocolRegistry,
): SnapshotItem[] {
    const result: SnapshotItem[] = [];

    for (const node of nodes) {
        const resolution = resolveRenderer(node, registry);
        if (!resolution.renderable) continue;

        result.push({
            id: node.id,
            visible: node.isVisible,
            protocolId: node.renderer.protocolId,
            descriptor: resolution.descriptor,
        });
    }

    return result;
}
