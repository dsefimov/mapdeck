import { ScatterplotLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import type { DeckOverlayManager } from "@core/domain/overlay";
import type { ClickPosition } from "../types";

const CLICK_MARKER_LAYER_ID = "feature-info-click-marker";

/**
 * Show a visual click marker on the map at the given position.
 * Auto-removes after the specified timeout.
 */
export function showClickMarker(
    position: ClickPosition,
    overlayManager: DeckOverlayManager,
    timeoutMs: number = 2000,
): void {
    if (!overlayManager.isAttached()) return;

    removeClickMarker(overlayManager);

    const layer = new ScatterplotLayer({
        id: CLICK_MARKER_LAYER_ID,
        data: [{ position: [position.lng, position.lat, 0] }],
        getPosition: (d: { position: [number, number, number] }) => d.position,
        getRadius: 8,
        getFillColor: [255, 255, 0, 200],
        getLineColor: [255, 200, 0, 255],
        getLineWidth: 2,
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        pickable: false,
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    });

    overlayManager.addLayer(CLICK_MARKER_LAYER_ID, layer);

    setTimeout(() => {
        removeClickMarker(overlayManager);
    }, timeoutMs);
}

/**
 * Remove the click marker from the map.
 */
export function removeClickMarker(overlayManager: DeckOverlayManager): void {
    overlayManager.removeLayer(CLICK_MARKER_LAYER_ID);
}
