import type maplibregl from "maplibre-gl";
import type { MapViewState } from "@deck.gl/core";

/** Camera state mirrored from a MapLibre map in deck.gl view state shape. */
export type MapViewStateFromMap = MapViewState & {
    padding?: { top?: number; bottom?: number; left?: number; right?: number };
    repeat: boolean;
};

/**
 * Build the deck.gl view state for a MapLibre map.
 * Mirrors `@deck.gl/mapbox` `getViewState`: longitude is wrapped to [-180, 180)
 * because `getCenter` may return values beyond it near the anti-meridian.
 */
export function buildMapViewState(map: maplibregl.Map): MapViewStateFromMap {
    const center = map.getCenter();
    return {
        longitude: ((center.lng + 540) % 360) - 180,
        latitude: center.lat,
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
        padding: map.getPadding(),
        repeat: map.getRenderWorldCopies(),
    };
}
