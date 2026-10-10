import type maplibregl from "maplibre-gl";
import type { LayerNode } from "@core/contracts";
import type { RegisterOptions } from "@core/lib/registry";

/**
 * A feature found at a map click. `unsupported` marks a placeholder for
 * layers whose protocol cannot provide feature info — the UI localizes it.
 */
export interface Feature {
    id: string;
    layerId: string;
    layerName: string;
    attributes: Record<string, unknown>;
    unsupported?: boolean;
}

/** Parameters of a feature collection at a map click. */
export interface CollectParams {
    screenX: number;
    screenY: number;
    map: maplibregl.Map;
    /** Pre-filtered visible layer nodes */
    visibleLayers: LayerNode[];
    /** Aborts the collection (e.g. a new click) */
    signal?: AbortSignal;
}

/** Collects the features of visible layers at a click position. */
export interface FeatureProvider {
    /**
     * Collect features at the screen coordinates.
     * Sync for deck.gl/MapLibre layers, async for WMS.
     */
    collect(params: CollectParams): Feature[] | Promise<Feature[]>;
}

/**
 * Read view of the registered feature-provider set — the port the
 * feature-info tool collects through. Registration happens in the
 * composition root and modules only.
 */
export interface FeatureProviderRegistry {
    /** All registered providers in registration order. */
    getAll(): FeatureProvider[];
    /** Whether a provider with the given id is registered. */
    has(id: string): boolean;
}

/**
 * Registration view of the feature-provider set — the port through which
 * modules add their own providers on top of the built-in set.
 */
export interface FeatureProviderRegistrationPort
    extends FeatureProviderRegistry {
    /**
     * Register a provider under a unique id. Duplicate ids throw unless
     * `opts.override`.
     */
    register(
        id: string,
        provider: FeatureProvider,
        opts?: RegisterOptions,
    ): void;
}

/** Features of one layer, grouped for display. */
export interface FeatureGroup {
    layerId: string;
    layerName: string;
    features: Feature[];
}

