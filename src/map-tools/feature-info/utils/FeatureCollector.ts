import type {
    FeatureProviderRegistry as FeatureProviderRegistryPort,
    Feature,
    FeatureGroup,
    CollectParams,
} from "@core/contracts";
import { logger } from "@core/lib/logger";

/** Features of one click, grouped for display — owned by the sole consumer. */
export interface CollectResult {
    groups: FeatureGroup[];
    /** True while any provider is still collecting */
    loading: boolean;
}

/**
 * Orchestrator that collects features from all registered providers.
 *
 * - Runs all providers in parallel
 * - Each feature becomes its own group — one selectable item per feature
 * - Loading state tracks whether any provider is still pending
 */
export class FeatureCollector {
    private registry: FeatureProviderRegistryPort;

    constructor(registry: FeatureProviderRegistryPort) {
        this.registry = registry;
    }

    /**
     * Collect features from all registered providers.
     *
     * Runs all providers in parallel. Calls onUpdate twice:
     * 1. Immediately with empty groups and loading=true
     * 2. When all providers complete with groups and loading=false
     *
     * @returns Final CollectResult when all providers complete
     */
    async collect(
        params: CollectParams,
        onUpdate: (result: CollectResult) => void,
    ): Promise<CollectResult> {
        const providers = this.registry.getAll();

        onUpdate({ groups: [], loading: true });

        if (params.signal?.aborted) {
            return { groups: [], loading: false };
        }

        const results = await Promise.allSettled(
            providers.map((provider) => provider.collect(params)),
        );

        if (params.signal?.aborted) {
            return { groups: [], loading: false };
        }

        const allFeatures: Feature[] = [];
        for (const result of results) {
            if (result.status === "rejected") {
                // A provider rejecting outright is unexpected — reporting a
                // failure through its own result channel (an error feature)
                // is the designed path. Best-effort contract: keep the
                // other providers' results flowing, loudly.
                logger.warn(
                    "FeatureCollector: a provider failed, skipping its features:",
                    result.reason,
                );
                continue;
            }
            allFeatures.push(...result.value);
        }

        const finalResult: CollectResult = {
            groups: this.groupFeatures(allFeatures),
            loading: false,
        };

        onUpdate(finalResult);
        return finalResult;
    }

    /**
     * Create one group per feature so each feature is a separate selectable item.
     */
    private groupFeatures(features: Feature[]): FeatureGroup[] {
        return features.map((feature) => ({
            layerId: feature.layerId,
            layerName: feature.layerName,
            features: [feature],
        }));
    }
}
