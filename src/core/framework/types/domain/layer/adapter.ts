/**
 * Layer adapter interface for role-based rendering.
 * Each adapter is responsible for managing layers of a specific role
 * on the map, including creation, removal, and visibility control.
 */
import type { LayerRole } from "./role";
import type { RenderDescriptor } from "./descriptor";
import type { RenderUnit } from "./renderUnit";
import type maplibregl from "maplibre-gl";

export interface LayerAdapter<TRole extends LayerRole = LayerRole> {
    /**
     * The layer role this adapter supports.
     * Used by factories to route layer operations to the appropriate adapter.
     */
    readonly role: TRole;

    /**
     * Add a layer to the map.
     * @param layerId - Unique identifier for the layer
     * @param descriptor - Render descriptor with config and source URL
     * @param map - Map instance to add the layer to
     */
    addToMap(
        layerId: string,
        descriptor: RenderDescriptor<TRole>,
        map: maplibregl.Map,
    ): void;

    /**
     * Remove a layer from the map.
     * @param layerId - Unique identifier for the layer
     * @param map - Map instance to remove the layer from
     */
    removeFromMap(layerId: string, map: maplibregl.Map): void;

    /**
     * Update layer visibility.
     * @param layerId - Unique identifier for the layer
     * @param visible - Whether the layer should be visible
     * @param map - Map instance containing the layer
     */
    updateVisibility(
        layerId: string,
        visible: boolean,
        map: maplibregl.Map,
    ): void;

    /**
     * Apply a new render unit configuration to the map.
     *
     * Called by LayerManager when a layer's config or source changes.
     * Each adapter decides how to handle the update:
     * - May update visual properties in-place (e.g. point cloud color scheme).
     * - Otherwise falls back to removeFromMap + addToMap.
     *
     * @param renderUnit - The render unit with new descriptor
     * @param map - Map instance containing the layer
     */
    updateConfig(renderUnit: RenderUnit<TRole>, map: maplibregl.Map): void;
}
