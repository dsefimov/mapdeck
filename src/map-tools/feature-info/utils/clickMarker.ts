import { ScatterplotLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import type { Layer } from "@deck.gl/core";
import type { OverlayManager } from "@core/contracts/domain/map-context";

/** Click position for the visual marker */
export interface ClickPosition {
    lng: number;
    lat: number;
}

const CLICK_MARKER_LAYER_ID = "feature-info-click-marker";

/** Only one marker exists at a time — the pending auto-remove timer for it. */
let markerTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Show a visual click marker on the map at the given position.
 * Auto-removes after the specified timeout.
 */
export function showClickMarker(
    position: ClickPosition,
    overlayManager: OverlayManager<Layer>,
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

    if (markerTimer) clearTimeout(markerTimer);
    markerTimer = setTimeout(() => {
        markerTimer = null;
        removeClickMarker(overlayManager);
    }, timeoutMs);
}

/**
 * Remove the click marker from the map and its pending auto-remove timer.
 */
export function removeClickMarker(
    overlayManager: OverlayManager<Layer>,
): void {
    if (markerTimer) {
        clearTimeout(markerTimer);
        markerTimer = null;
    }
    overlayManager.removeLayer(CLICK_MARKER_LAYER_ID);
}
