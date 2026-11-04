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

/**
 * Distance of a deck.gl frustum plane after translating its camera.
 *
 * deck.gl planes and the kernel's culling test put a point inside a plane
 * when `normal · point ≤ distance`. Translating the frustum by `offset`
 * (common space) moves that half-space with it — `normal · (x − offset) ≤
 * distance` — so the translated plane's distance is
 * `distance + normal · offset`. This is how the terrain-anchored camera is
 * modeled: MapLibre's terrain camera is the flat camera translated
 * vertically, so the plane distances shift while projections stay in the
 * flat viewport's common space.
 */
export function translatedPlaneDistance(
    distance: number,
    normal: readonly number[],
    offset: readonly number[],
): number {
    const [nx = 0, ny = 0, nz = 0] = normal;
    const [ox = 0, oy = 0, oz = 0] = offset;
    return distance + nx * ox + ny * oy + nz * oz;
}
