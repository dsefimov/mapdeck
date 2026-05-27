import type maplibregl from "maplibre-gl";
import type { DeckOverlayManager } from "@core/domain/overlay";

/**
 * Map-level context passed to LayerAdapter methods.
 * Provides access to the MapLibre map instance and related services.
 */
export interface MapContext {
    /** MapLibre GL map instance */
    readonly map: maplibregl.Map;
    /** Deck.gl overlay manager for rendering overlay layers */
    readonly overlayManager: DeckOverlayManager;
}
