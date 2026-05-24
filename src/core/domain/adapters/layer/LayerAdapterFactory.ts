/**
 * Factory for managing layer adapters by layer role.
 */
import { type LayerAdapter, type LayerRole } from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";

export class LayerAdapterFactory {
    private readonly adapters = new Map<LayerRole, LayerAdapter>();

    /**
     * Register a layer adapter for a specific role.
     * Registration is idempotent - if an adapter is already registered for the role,
     * it will be replaced with the new adapter.
     *
     * @param role - The layer role this adapter supports
     * @param adapter - The adapter instance to register
     * @throws Error if adapter initialization fails
     */
    async register(role: LayerRole, adapter: LayerAdapter): Promise<void> {
        try {
            if (adapter.role !== role) {
                throw new Error(
                    `Adapter claims to support role "${adapter.role}" but was registered for role "${role}"`,
                );
            }

            this.adapters.set(role, adapter);
        } catch (error) {
            logger.error(
                `Failed to register layer adapter for role "${role}":`,
                error,
            );
            throw error;
        }
    }

    /**
     * Get a layer adapter for the specified role.
     *
     * @param role - The layer role to get an adapter for
     * @returns The LayerAdapter instance for the specified role
     * @throws Error if no adapter is registered for the role
     */
    get(role: LayerRole): LayerAdapter {
        const adapter = this.adapters.get(role);
        if (!adapter) {
            throw new Error(`No layer adapter registered for role: ${role}`);
        }
        return adapter;
    }

    /**
     * Check if an adapter is registered for the specified role.
     *
     * @param role - The layer role to check
     * @returns true if an adapter is registered for the role
     */
    has(role: LayerRole): boolean {
        return this.adapters.has(role);
    }
}

export const layerAdapterFactory = new LayerAdapterFactory();
