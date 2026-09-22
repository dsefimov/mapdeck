/** Geometry of a technical (non-data) layer. */
import type { GeoPoint } from "@core/lib/geo";

/** Kind of a geometry stored in a technical layer. */
export type GeometryKind = "point" | "polyline" | "polygon";

/**
 * An editable geometry: an ordered list of geo points with a stable id.
 */
export interface Geometry {
    id: string;
    kind: GeometryKind;
    points: GeoPoint[];
}

/**
 * The renderable slice of a tech layer's state — what
 * `renderTechLayers` consumes. Pure data; deck.gl construction belongs to
 * the overlay renderer (ADR-0010 amendment).
 */
export interface TechLayerSpec {
    readonly geometries: readonly Geometry[];
    readonly drawing: Geometry | null;
    readonly previewPoint: GeoPoint | null;
}
