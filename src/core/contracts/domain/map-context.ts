import type maplibregl from "maplibre-gl";
import type { Viewport, PickingInfo } from "@deck.gl/core";
import type { FrustumPlanes } from "@core/lib/geo";

/**
 * Port for the deck.gl overlay backend: attach/detach, layer lifecycle and
 * picking (ADR-0010). Camera queries live on {@link MapContext} — the camera
 * is a property of the map, not of the overlay backend.
 */
export interface OverlayManager<TLayer = unknown> {
    /** Attach overlay to maplibre map */
    attachToMap(map: maplibregl.Map): void;
    /** Detach overlay from current map */
    detachFromMap(): void;
    /** Add a layer to the overlay */
    addLayer(layerId: string, layer: TLayer): void;
    /** Remove a layer from the overlay */
    removeLayer(layerId: string): boolean;
    /** Update properties of an existing layer */
    updateLayer(layerId: string, props: Partial<TLayer>): boolean;
    /** Update layer visibility */
    setLayerVisibility(layerId: string, visible: boolean): boolean;
    /** Check if overlay is attached to a map */
    isAttached(): boolean;
    /** Get current map instance */
    getMap(): maplibregl.Map | null;
    /** Pick a single object at screen coordinates */
    pickObject(x: number, y: number, radius?: number): PickingInfo | null;
    /** Pick all objects at screen coordinates */
    pickObjects(x: number, y: number, radius?: number): PickingInfo[];
    /** Clean up all resources */
    dispose(): void;
}

/**
 * Map-level context passed to LayerAdapter methods.
 * Provides access to the MapLibre map instance and related services.
 */
export interface MapContext {
    /** MapLibre GL map instance */
    readonly map: maplibregl.Map;
    /** Deck.gl overlay manager for rendering overlay layers (port, not a concrete class) */
    readonly overlayManager: OverlayManager<import("@deck.gl/core").Layer>;
    /**
     * Reports an asynchronous layer-lifecycle failure (init, render-unit
     * build) for reconciliation by the layer manager. The manager-provided
     * context always supplies this; adapters call it defensively and must
     * log the failure themselves in all cases.
     */
    readonly reportLayerError?: (layerId: string, error: unknown) => void;
    /** Camera position as [lng, lat, height] when available (ADR-0010) */
    readonly getCameraPosition?: () => [number, number, number] | null;
    /** Active deck.gl viewport (ADR-0010) */
    readonly getActiveViewport?: () => Viewport | null;
    /** View frustum planes of the active viewport (ADR-0010) */
    readonly getFrustumPlanes?: () => FrustumPlanes | null;
}
