/**
 * Layer adapter interface for rendering.
 * Each adapter is responsible for managing layers of a specific kind
 * on the map, including creation, removal, and visibility control.
 *
 * @typeParam C - Protocol-specific config type
 */
import type { MapContext } from "./map-context";

/** Manages layers of a specific kind on the map: creation, removal, visibility. */
export interface LayerAdapter<C = Record<string, unknown>> {
    /**
     * Whether this adapter renders via native MapLibre layers
     * (as opposed to deck.gl overlay). Used for z-order management.
     */
    readonly nativeLayerOrdering: boolean;

    /**
     * Add a layer to the map.
     * @param layerId - Unique identifier for the layer
     * @param descriptor - Render descriptor with config and source URL
     * @param ctx - Map context with map instance and related services
     */
    addToMap(
        layerId: string,
        descriptor: RenderDescriptor<C>,
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
    updateConfig(renderUnit: RenderUnit<C>, ctx: MapContext): void;
}
/**
 * Unified render descriptor — single source of truth for map rendering.
 * Created by a protocol via Protocol.createRenderDescriptor(), not stored on the node.
 *
 * @typeParam C - Protocol-specific config type (defaults to Record<string, unknown>)
 */
export interface RenderDescriptor<C = Record<string, unknown>> {
    readonly sourceUrl: string;
    readonly config: C;
}

/**
 * A render unit represents either a single layer or a group of layers
 * that are rendered as one unit on the map.
 *
 * - Single layer: nodeIds = [nodeId], id = nodeId
 * - WMS group: nodeIds = [nodeId1, nodeId2, ...], id = groupId
 */
export interface RenderUnit<C = Record<string, unknown>> {
    id: string;
    nodeIds: string[];
    protocolId: string;
    adapter: LayerAdapter<C>;
    descriptor: RenderDescriptor<C>;
}

/**
 * Snapshot of a layer node for building render units.
 * Produced by LayerTreeStore.layerSnapshot.
 * Nodes without a valid protocol are excluded — descriptor is always present.
 */
export interface SnapshotItem {
    id: string;
    visible: boolean;
    protocolId: string;
    descriptor: RenderDescriptor;
}

/**
 * Read access to the tree's render snapshot — the declared cross-domain edge
 * the map consumes (ADR-0002). The layer manager reads the snapshot through
 * this port, never through the concrete store.
 */
export interface LayerSnapshotSource {
    readonly layerSnapshot: SnapshotItem[];
}

/**
 * The tree's per-node render-error channel, written by the layer manager
 * (the render channel of ADR-0008) — the second half of the map → tree edge.
 */
export interface RenderErrorSink {
    reportRenderError(nodeIds: string[], error: string | null): void;
}
