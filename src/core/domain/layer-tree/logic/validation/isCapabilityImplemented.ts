import type {
    BindingSlot,
    NodeCapability,
    ProtocolBinding,
} from "@core/contracts";

/** The two bindings a capability's slot may resolve against. */
type NodeBindings = {
    renderer: ProtocolBinding;
    data?: ProtocolBinding | undefined;
};

/**
 * Core verification rule: a capability is implemented when the
 * tool link `(protocolId of the node's binding for that slot, slot, toolId)`
 * exists. A capability whose slot has no binding on the node is
 * unimplemented by definition — the link cannot exist without the binding.
 * Sources run this per capability at assignment and drop failures.
 * @param capability - Capability being assigned
 * @param bindings - The node's renderer/data bindings
 * @param hasLink - Lookup into the tool-link table (ToolStore)
 */
export function isCapabilityImplemented(
    capability: NodeCapability,
    bindings: NodeBindings,
    hasLink: (protocolId: string, slot: BindingSlot, toolId: string) => boolean,
): boolean {
    const binding = bindings[capability.slot];
    if (!binding) return false;
    return hasLink(binding.protocolId, capability.slot, capability.toolId);
}
