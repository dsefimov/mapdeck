import type {
    BindingSlot,
    NodeCapability,
    ProtocolBinding,
} from "@core/contracts";
import { isCapabilityImplemented } from "@core/domain/layer-tree";

/** What the assignment step needs from the core's tool-link table. */
export interface CapabilitySource {
    linkedToolIds(protocolId: string, slot: BindingSlot): string[];
    hasLink(protocolId: string, slot: BindingSlot, toolId: string): boolean;
}

function candidatesForSlot(
    binding: ProtocolBinding | undefined,
    slot: BindingSlot,
    source: CapabilitySource,
): NodeCapability[] {
    if (!binding) return [];
    return source
        .linkedToolIds(binding.protocolId, slot)
        .map((toolId) => ({ toolId, slot }));
}

/**
 * The module's assignment step: a resolved binding offers every
 * tool linked to it in that slot as a candidate capability; the core
 * verifier gates each candidate. Renderer candidates come before data
 * candidates; duplicates by tool id are skipped (first slot wins).
 */
export function assignCapabilities(
    bindings: { renderer: ProtocolBinding; data?: ProtocolBinding },
    source: CapabilitySource,
): { capabilities: NodeCapability[]; unimplemented: NodeCapability[] } {
    const capabilities: NodeCapability[] = [];
    const unimplemented: NodeCapability[] = [];
    const seen = new Set<string>();

    for (const capability of [
        ...candidatesForSlot(bindings.renderer, "renderer", source),
        ...candidatesForSlot(bindings.data, "data", source),
    ]) {
        // Wrapped — a bare `source.hasLink` detaches the store method's this.
        if (
            !isCapabilityImplemented(
                capability,
                bindings,
                (protocolId, slot, toolId) =>
                    source.hasLink(protocolId, slot, toolId),
            )
        ) {
            unimplemented.push(capability);
            continue;
        }
        if (seen.has(capability.toolId)) continue;
        seen.add(capability.toolId);
        capabilities.push(capability);
    }

    return { capabilities, unimplemented };
}
