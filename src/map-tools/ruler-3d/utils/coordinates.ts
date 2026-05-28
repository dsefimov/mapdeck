/**
 * Ruler-3d specific coordinate utilities.
 * Delegates to shared utilities in core/utils/picking.ts and measurements.ts
 */
import distance from "@turf/distance";
import { point } from "@turf/helpers";

// Re-export shared utilities for backward compatibility
export {
    pickPointFromCloud,
    getPointWithFallback,
} from "@core/domain/point-cloud/picking";
export {
    formatDistance,
    convertPointToDegrees,
} from "@core/shared/geo/formatters";

export function geodesicDistance(
    point1: [number, number],
    point2: [number, number],
): number {
    return distance(point(point1), point(point2), { units: "meters" });
}
