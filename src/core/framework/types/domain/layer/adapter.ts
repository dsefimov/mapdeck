/**
 * Layer adapter interface for role-based rendering.
 * Each adapter is responsible for managing layers of a specific role
 * on the map, including creation, removal, and visibility control.
 */
import type { LayerRole } from "./role";
import type { RenderDescriptor } from "./descriptor";
import type { RenderUnit } from "./renderUnit";
import type { MapContext } from "./mapContext";

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
     * @param ctx - Map context with map instance and related services
     */
    addToMap(
        layerId: string,
        descriptor: RenderDescriptor<TRole>,
        ctx: MapContext,
    ): void;

    /**
     * Remove a layer from the map.
     * @param layerId - Unique identifier for the layer
     * @param ctx - Map context with map instance and related services
     */
    removeFromMap(layerId: string, ctx: MapContext): void;

    /**
     * Update layer visibility.
     * @param layerId - Unique identifier for the layer
     * @param visible - Whether the layer should be visible
     * @param ctx - Map context with map instance and related services
     */
    updateVisibility(layerId: string, visible: boolean, ctx: MapContext): void;

    /**
     * Apply a new render unit configuration to the map.
     *
     * Called by LayerManager when a layer's config or source changes.
     * Each adapter decides how to handle the update:
     * - May update visual properties in-place (e.g. point cloud color scheme).
     * - Otherwise falls back to removeFromMap + addToMap.
     *
     * @param renderUnit - The render unit with new descriptor
     * @param ctx - Map context with map instance and related services
     */
    updateConfig(renderUnit: RenderUnit<TRole>, ctx: MapContext): void;

    /**
     * Get loaded data for a layer, if the adapter supports it.
     * Implemented by data-providing adapters (e.g. PointCloudAdapter).
     *
     * @param layerId - Unique identifier for the layer
     * @returns The loaded data, or undefined if not available
     */
    getLoadedData?(layerId: string): unknown;
}
