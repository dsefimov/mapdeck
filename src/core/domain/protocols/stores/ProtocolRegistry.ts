import type {
    Protocol,
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
 */
export class ProtocolRegistry implements ProtocolRegistrationPort {
    private readonly byId = new Registry<Protocol>();

    register(protocol: Protocol, opts?: RegisterOptions): void {
        this.byId.register(protocol, opts);
    }

    getById(id: string): Protocol | undefined {
        return this.byId.get(id);
    }

    getAll(): Protocol[] {
        return this.byId.getAll();
    }
}
