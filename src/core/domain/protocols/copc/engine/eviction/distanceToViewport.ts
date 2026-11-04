import type { BBox3D } from "@core/lib/geo";

/**
 * Viewport footprint in WGS84 degrees: [minLng, minLat, maxLng, maxLat].
 * Same shape the adapter reports from the map for every cycle.
 */
export type ViewportRect = [number, number, number, number];

/** Meters per degree of latitude — effectively constant worldwide. */
const METERS_PER_DEG_LAT = 111_320;

/**
 * Distance from a node's bounds to the viewport rectangle, in meters.
 * Zero when they touch or overlap: a node inside the view is as close as
 * it gets, whatever the camera direction. Longitude is scaled by
 * cos(latitude) — at 55°N an east-west degree is ~57% of a north-south
 * one, and victim ranking must not systematically prefer one axis.
 */
export function distanceToViewportMeters(
    bounds: BBox3D,
    viewport: ViewportRect,
): number {
    const [vMinLng, vMinLat, vMaxLng, vMaxLat] = viewport;
    const dxDeg = Math.max(vMinLng - bounds.maxX, bounds.minX - vMaxLng, 0);
    const dyDeg = Math.max(vMinLat - bounds.maxY, bounds.minY - vMaxLat, 0);
    if (dxDeg === 0 && dyDeg === 0) return 0;

    const midLat =
        ((bounds.minY + bounds.maxY) / 2 + (vMinLat + vMaxLat) / 2) / 2;
    const xMeters =
        dxDeg * METERS_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
    const yMeters = dyDeg * METERS_PER_DEG_LAT;
    return Math.hypot(xMeters, yMeters);
}
