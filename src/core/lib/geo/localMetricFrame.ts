/**
 * Local metric coordinate frames for site-scale geo computations.
 */

import proj4 from "proj4";

/**
 * A planar, meters-valued frame anchored at a WGS84 point. Within a site —
 * hundreds of meters to a few kilometers around the anchor — the frame is
 * metric: planar arithmetic may replace geodesic math at sub-ppm distortion.
 */
export interface LocalMetricFrame {
    /** Project WGS84 [lng, lat] degrees to frame meters. */
    toMeters(lng: number, lat: number): [number, number];
    /** Project frame meters back to WGS84 [lng, lat] degrees. */
    toDegrees(x: number, y: number): [number, number];
}

/**
 * Builds a local transverse Mercator frame anchored at the given point.
 *
 * Why local tmerc and not the alternatives: it is conformal with sub-ppm
 * scale error at site scale and proj4 implements both directions — unlike
 * azimuthal-equidistant, whose radial distances from the anchor would be
 * exact but whose inverse proj4 does not implement, so an aeqd frame cannot
 * be brought back to degrees. Per-axis meters-per-degree constants are
 * rejected on accuracy grounds: they carry a systematic ~0.5% error at mid
 * latitudes (and a full cos(lat) error when misapplied to both axes).
 */
export function createLocalMetricFrame(
    centerLng: number,
    centerLat: number,
): LocalMetricFrame {
    const converter = proj4(
        "EPSG:4326",
        `+proj=tmerc +lat_0=${centerLat} +lon_0=${centerLng} +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m`,
    );
    return {
        toMeters(lng, lat) {
            return converter.forward([lng, lat]);
        },
        toDegrees(x, y) {
            return converter.inverse([x, y]);
        },
    };
}
