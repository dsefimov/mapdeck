/**
 * Pure renderer for the selection highlight: turns the shared selection
 * records into the deck.gl overlay layer drawn on top of every data
 * layer. The store stays a state container; deck.gl construction lives
 * here, at the overlay adapter seam, with the color injected per call.
 */
import { GeoJsonLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import type { Layer } from "@deck.gl/core";
import type { Feature } from "geojson";
import { hexToRgba } from "@core/lib/color";
import type { Bbox } from "@core/lib/geo";
import type { SelectedGeometry, SelectionRecord } from "@core/common/selection";

/** The overlay layer id picks must skip (tool-owned, like the click marker). */
export const SELECTION_HIGHLIGHT_LAYER_ID = "selection-highlight";

const FILL_ALPHA = 70;
const LINE_ALPHA = 230;
const LINE_WIDTH_PX = 2;
const POINT_RADIUS_PX = 6;

function feature(
    key: string,
    geometry: SelectedGeometry,
): Feature {
    // Picked geometries are GeoJSON at heart, but arrive structurally
    // typed (`coordinates: unknown`) — the runtime shape is whatever
    // deck/maplibre handed out, re-serialized as-is.
    return {
        type: "Feature",
        geometry: geometry as Feature["geometry"],
        properties: { selectionKey: key },
    };
}

/** A bbox footprint draws as its rectangle — the table-selection mark. */
function bboxFeature(key: string, bbox: Bbox): Feature {
    const ring: [number, number][] = [
        [bbox.west, bbox.south],
        [bbox.east, bbox.south],
        [bbox.east, bbox.north],
        [bbox.west, bbox.north],
        [bbox.west, bbox.south],
    ];
    return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: { selectionKey: key },
    };
}

/**
 * Renders the selection highlight as `[id, layer]` pairs for
 * `useOverlayLayers` — a null layer removes it from the overlay.
 */
export function renderSelectionHighlight(
    records: readonly SelectionRecord[],
    color: string,
): ReadonlyArray<readonly [string, Layer | null]> {
    const features: Feature[] = [];
    for (const record of records) {
        const footprint = record.footprint;
        if (!footprint) continue;
        if (footprint.kind === "geometry") {
            features.push(feature(record.key, footprint.geometry));
        } else if (footprint.kind === "point") {
            features.push(feature(record.key, {
                type: "Point",
                coordinates: [...footprint.position],
            }));
        } else {
            features.push(bboxFeature(record.key, footprint.bbox));
        }
    }

    const layer =
        features.length > 0
            ? new GeoJsonLayer({
                  id: SELECTION_HIGHLIGHT_LAYER_ID,
                  data: features,
                  pickable: false,
                  filled: true,
                  stroked: true,
                  getFillColor: hexToRgba(color, FILL_ALPHA),
                  getLineColor: hexToRgba(color, LINE_ALPHA),
                  lineWidthUnits: "pixels",
                  getLineWidth: LINE_WIDTH_PX,
                  pointRadiusUnits: "pixels",
                  getPointRadius: POINT_RADIUS_PX,
                  coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
              })
            : null;

    return [[SELECTION_HIGHLIGHT_LAYER_ID, layer]];
}
