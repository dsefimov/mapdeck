import type { Bbox } from "@core/lib/geo";

/**
 * How a map pick or table toggle combines with the layer's existing
 * selection — the panel's mode buttons.
 */
export type SelectionMode = "new" | "add" | "remove";

/**
 * Minimal GeoJSON geometry — structural, so features picked from deck
 * overlays and maplibre queries pass as-is.
 */
export interface SelectedGeometry {
    readonly type:
        | "Point"
        | "LineString"
        | "Polygon"
        | "MultiPoint"
        | "MultiLineString"
        | "MultiPolygon";
    readonly coordinates: unknown;
}

/**
 * What is known about a selected feature's location: the exact geometry
 * (map-picked features), a single position (point-cloud picks), or just a
 * bbox (attribute-table rows, which carry `_bbox` only).
 */
export type SelectionFootprint =
    | {
          readonly kind: "geometry";
          readonly geometry: SelectedGeometry;
          readonly bbox: Bbox;
      }
    | {
          readonly kind: "point";
          readonly position: readonly [number, number, number];
          readonly bbox: Bbox;
      }
    | { readonly kind: "bbox"; readonly bbox: Bbox };

/** One selected feature, keyed by the shared feature-key convention. */
export interface SelectionRecord {
    readonly key: string;
    readonly footprint: SelectionFootprint | null;
}
