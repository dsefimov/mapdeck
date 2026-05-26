/**
 * Factory for managing attribute data adapters by adapter type.
 */
import type { AttributeDataAdapter } from "@core/framework/types";
import type { AttributeRole } from "@core/framework/types";

export class AttributeAdapterFactory {
    private readonly adapters = new Map<string, AttributeDataAdapter>();

    register(type: string, adapter: AttributeDataAdapter): void {
        this.adapters.set(type, adapter);
    }

    get(role: AttributeRole): AttributeDataAdapter {
        const type = role.attributeConfig.type ?? "wfs";
        const adapter = this.adapters.get(type);
        if (!adapter) {
            throw new Error(
                `No attribute adapter registered for type: ${type}`,
            );
        }
        return adapter;
    }

    has(type: string): boolean {
        return this.adapters.has(type);
    }
}
