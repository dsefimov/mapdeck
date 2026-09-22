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
 * Port over the feature-provider registry (ADR-0004): what modules and the
 * composition root register feature providers through.
 */
export interface FeatureProviderRegistry {
    /**
     * Register a provider under a unique id. Duplicate ids throw unless
     * `opts.override` — the explicit replacement of ADR-0005.
     */
    register(
        id: string,
        provider: FeatureProvider,
        opts?: RegisterOptions,
    ): void;
    /** All registered providers in registration order. */
    getAll(): FeatureProvider[];
    /** Whether a provider with the given id is registered. */
    has(id: string): boolean;
}

/** Features of one layer, grouped for display. */
export interface FeatureGroup {
    layerId: string;
    layerName: string;
    features: Feature[];
}

