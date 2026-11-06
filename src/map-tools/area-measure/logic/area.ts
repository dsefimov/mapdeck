/**
 * Pure measurement math for the area tool: great-circle edges, perimeter
 * and projected 2D area of the drawn polygon.
 *
 * Both the turf area and the great-circle perimeter are spherical.
 * The migration path is one local metric frame (the volume-measure
 * pattern): planar shoelace area + planar perimeter in that frame,
 * removing the last @turf dependency and unifying precision with
 * volume-measure.
 */
import { greatCircleDistance, calculatePolygonPerimeter } from "@core/lib/geo";
import type { GeoPoint } from "@core/lib/geo";
import area from "@turf/area";
import { polygon } from "@turf/helpers";
import type { AreaMeasurements, PolygonEdge } from "../types";

/** Projected 2D area of a closed polygon in square meters. */
function calculateArea2D(points: GeoPoint[]): number {
    const [first] = points;
    if (points.length < 3 || !first) return 0;
    const coords = points.map((p) => [p.lng, p.lat]);
    coords.push([first.lng, first.lat]);
    return area(polygon([coords]));
}

/** Measure the polygon drawn so far — safe on any prefix of vertices. */
export function measurePolygonArea(points: GeoPoint[]): AreaMeasurements {
    const edges: PolygonEdge[] = [];
    for (let i = 1; i < points.length; i++) {
        const from = points[i - 1];
        const to = points[i];
        if (!from || !to) continue;
        edges.push({
            from,
            to,
            distanceMeters: greatCircleDistance(
                [from.lng, from.lat],
                [to.lng, to.lat],
            ),
        });
    }
    return {
        areaSquareMeters: calculateArea2D(points),
        perimeterMeters: calculatePolygonPerimeter(
            points.map((p) => [p.lng, p.lat]),
        ),
        edges,
        vertexCount: points.length,
    };
}
