import type {
    FeatureProvider,
    FeatureProviderRegistrationPort,
} from "@core/contracts";
import { KeyedRegistry, type RegisterOptions } from "@core/lib/registry";

/**
 * Registry for feature providers — the sources the feature-info tool collects
 * from. Owned by RootStore (no module singleton): each store instance carries
 * its own registry, so a bootstrap retry registers into an empty one.
 */
export class FeatureProviderRegistry
    implements FeatureProviderRegistrationPort
{
    private readonly providers = new KeyedRegistry<string, FeatureProvider>(
        "Feature provider",
    );

    /**
     * Register a feature provider under a unique ID. Duplicate IDs throw
     * unless `opts.override`.
     */
    register(
        id: string,
        provider: FeatureProvider,
        opts?: RegisterOptions,
    ): void {
        this.providers.register(id, provider, opts);
    }

    /** All registered providers in registration order. */
    getAll(): FeatureProvider[] {
        return this.providers.getAll();
    }

    /** Check whether a provider with the given ID is registered. */
    has(id: string): boolean {
        return this.providers.has(id);
    }
}
