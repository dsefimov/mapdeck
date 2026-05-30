import type {
    Feature,
    FeatureGroup,
    CollectParams,
    CollectResult,
} from "../types";
import {
    featureProviderRegistry,
    FeatureProviderRegistry,
} from "../providers/FeatureProvider";

/**
 * Orchestrator that collects features from all registered providers.
 *
 * - Runs all providers in parallel
 * - Results are grouped by layerId
 * - Loading state tracks whether any provider is still pending
 */
export class FeatureCollector {
    private registry: FeatureProviderRegistry;

    constructor(registry: FeatureProviderRegistry = featureProviderRegistry) {
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

        // Signal initial loading state
        onUpdate({ groups: [], loading: true });

        // Check if already aborted
        if (params.signal?.aborted) {
            return { groups: [], loading: false };
        }

        // Run all providers in parallel
        const results = await Promise.allSettled(
            providers.map((provider) => provider.collect(params)),
        );

        // Check again after providers complete
        if (params.signal?.aborted) {
            return { groups: [], loading: false };
        }

        // Combine all features from successful results
        const allFeatures: Feature[] = [];
        for (const result of results) {
            if (result.status === "fulfilled") {
                allFeatures.push(...result.value);
            }
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
            sourceType: feature.sourceType,
            features: [feature],
            loading: false,
        }));
    }
}

// Singleton instance
export const featureCollector = new FeatureCollector();
