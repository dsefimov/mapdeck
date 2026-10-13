import type {
    AssetMappingPort,
    Protocol,
    ProtocolDeclaration,
    ProtocolRegistrationPort,
} from "@core/contracts";
import {
    Registry,
    type RegisterOptions,
} from "@core/lib/registry";

/**
 * Registry of protocol implementations.
 *
 * Protocols are registered by unique string ID.
 * Protocols do NOT link themselves to tools — tool protocol bindings are
 * established in the tool's own registration code via
 * ToolStore.bindToolToProtocol, the single mechanism linking protocols to
 * tools.
 * Duplicate registrations throw unless `{ override: true }`.
 *
 * When the asset mapper is wired in, a registration's declaration
 * (slot fitness, matching rules) is applied with the same options —
 * overriding a protocol overrides its declaration too.
 */
export class ProtocolRegistry implements ProtocolRegistrationPort {
    private readonly byId = new Registry<Protocol>();

    constructor(private readonly assetMapping?: AssetMappingPort) {}

    register(
        protocol: Protocol,
        opts?: RegisterOptions,
        declaration?: ProtocolDeclaration,
    ): void {
        this.byId.register(protocol, opts);
        if (!this.assetMapping || !declaration) return;

        if (declaration.slots && Object.keys(declaration.slots).length > 0) {
            this.assetMapping.registerSlots(protocol.id, declaration.slots, opts);
        }
        for (const rule of declaration.rules ?? []) {
            this.assetMapping.registerRule(rule);
        }
    }

    getById(id: string): Protocol | undefined {
        return this.byId.get(id);
    }

    getAll(): Protocol[] {
        return this.byId.getAll();
    }
}
