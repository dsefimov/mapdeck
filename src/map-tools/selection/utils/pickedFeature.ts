import type { PickingInfo } from "@deck.gl/core";
import type maplibregl from "maplibre-gl";
import { bboxFromGeometry, Bbox } from "@core/lib/geo";
import {
    stableFeatureKey,
    type SelectedGeometry,
    type SelectionFootprint,
    type SelectionRecord,
} from "@core/common/selection";

/**
 * Padding that keeps a point feature's bbox zoomable: a degenerate
 * extent is rejected by the zoom helpers, and ~0.001° lands near a
 * recognizable street-block scale.
 */
const POINT_BBOX_PAD_DEG = 0.001;

const GEOMETRY_TYPES = new Set([
    "Point",
    "LineString",
    "Polygon",
    "MultiPoint",
    "MultiLineString",
    "MultiPolygon",
]);

function paddedPointBbox(lng: number, lat: number): Bbox {
    return new Bbox([
        lng - POINT_BBOX_PAD_DEG,
        lat - POINT_BBOX_PAD_DEG,
        lng + POINT_BBOX_PAD_DEG,
        lat + POINT_BBOX_PAD_DEG,
    ]);
}

/** A recognizable GeoJSON shape with a computable bbox passes as-is. */
function geometryFootprint(
    geometry: unknown,
): SelectionFootprint | null {
    if (
        typeof geometry !== "object" ||
        geometry === null ||
        !("type" in geometry) ||
        !GEOMETRY_TYPES.has(String((geometry as { type: unknown }).type))
    ) {
        return null;
    }
    const bbox = bboxFromGeometry(geometry);
    if (!bbox) return null;
    return {
        kind: "geometry",
        geometry: geometry as SelectedGeometry,
        bbox,
    };
}

/** A `[lng, lat(, z)]` position is a point (point-cloud data). */
function pointFootprint(position: unknown): SelectionFootprint | null {
    if (
        !Array.isArray(position) ||
        position.length < 2 ||
        !Number.isFinite(position[0]) ||
        !Number.isFinite(position[1])
    ) {
        return null;
    }
    // The guards above already verified the first two channels are
    // finite; the cast restores what they proved to the type level.
    const [lng, lat, z] = position as [number, number, number | undefined];
    return {
        kind: "point",
        position: [lng, lat, z !== undefined && Number.isFinite(z) ? z : 0],
        bbox: paddedPointBbox(lng, lat),
    };
}

/**
 * Footprint of unknown picked geometry: a GeoJSON shape, a point
 * position, or nothing — a feature without a footprint still counts,
 * it is just never drawn.
 */
function footprintOf(
    geometry: unknown,
    position: unknown,
): SelectionFootprint | null {
    return geometryFootprint(geometry) ?? pointFootprint(position);
}

/** Record for a deck overlay pick — the datum is the layer's own object. */
export function recordFromDeckPick(info: PickingInfo): SelectionRecord | null {
    const object = info.object as Record<string, unknown> | null | undefined;
    if (!object) return null;

    const properties =
        (object.properties as Record<string, unknown> | undefined) ?? {};
    // A GeoJSON feature's id member — the same identity the attribute
    // pipeline surfaces as `_featureId`.
    const featureId = object.id as string | number | null | undefined;
    const key =
        stableFeatureKey(properties, featureId) ??
        `pick-${info.index?.toString() ?? "0"}`;
    return {
        key,
        footprint: footprintOf(object.geometry, object.position),
    };
}

/** Record for a native maplibre query result (lnglat geometry included). */
export function recordFromNativeFeature(
    feature: maplibregl.MapGeoJSONFeature,
    index: number,
): SelectionRecord {
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    const key =
        stableFeatureKey(properties, feature.id ?? null) ?? `pick-${index}`;
    return {
        key,
        footprint: footprintOf(feature.geometry, null),
    };
}
