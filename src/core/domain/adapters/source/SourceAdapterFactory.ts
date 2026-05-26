/**
 * Factory for managing source adapters by source type.
 */
import { type SourceAdapter } from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";

export class SourceAdapterFactory {
    private readonly adapters = new Map<string, SourceAdapter>();
    private _defaultType: string | null = null;

    /**
     * Register a source adapter for a specific type.
     * The first registered adapter becomes the default.
     * Registration is idempotent - if an adapter is already registered for the type,
     * it will be replaced with the new adapter.
     *
     * @param type - The adapter type (e.g., 'stac', 'geojson', 'wms')
     * @param adapter - The adapter instance to register
     * @param config - Optional configuration for adapter initialization
     * @throws Error if adapter initialization fails
     */
    async register(
        type: string,
        adapter: SourceAdapter,
        config?: Record<string, unknown>,
    ): Promise<void> {
        try {
            if (adapter.type !== type) {
                throw new Error(
                    `Adapter claims to be type "${adapter.type}" but was registered as "${type}"`,
                );
            }

            // Adapter will be initialized later with the actual URL from settings
            if (config !== undefined && adapter.initialize) {
                const result = adapter.initialize(config);
                if (result instanceof Promise) {
                    await result;
                }
            }

            this.adapters.set(type, adapter);

            if (this._defaultType === null) {
                this._defaultType = type;
            }
        } catch (error) {
            logger.error(
                `Failed to register source adapter for type "${type}":`,
                error,
            );
            throw error;
        }
    }

    /**
     * Get the default source adapter (the first one that was registered).
     *
     * @returns The default SourceAdapter instance
     * @throws Error if no adapter is registered
     */
    getDefault(): SourceAdapter {
        if (!this._defaultType) {
            throw new Error("No source adapter registered");
        }
        return this.get(this._defaultType);
    }

    /**
     * Get a source adapter for the specified type.
     *
     * @param type - The adapter type to get (e.g., 'stac', 'geojson', 'wms')
     * @returns The SourceAdapter instance for the specified type
     * @throws Error if no adapter is registered for the type
     */
    get(type: string): SourceAdapter {
        const adapter = this.adapters.get(type);
        if (!adapter) {
            throw new Error(`No source adapter registered for type: ${type}`);
        }
        return adapter;
    }

    /**
     * Check if an adapter is registered for the specified type.
     *
     * @param type - The adapter type to check
     * @returns true if an adapter is registered for the type
     */
    has(type: string): boolean {
        return this.adapters.has(type);
    }

    /**
     * Check if a default adapter has been registered.
     *
     * @returns true if at least one adapter has been registered
     */
    hasDefault(): boolean {
        return this._defaultType !== null;
    }
}
