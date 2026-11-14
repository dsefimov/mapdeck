/**
 * Pure renderer for the selection drag preview: the rubber-band
 * rectangle a user drags on the map, drawn through the overlay port
 * like the tech layers. The rectangle arrives in screen pixels and is
 * unprojected here per call.
 */
import { GeoJsonLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import type { Layer } from "@deck.gl/core";
import type maplibregl from "maplibre-gl";
import type { Feature } from "geojson";
import { hexToRgba } from "@core/lib/color";
import type { DragRect } from "./SelectionToolStore";

export const SELECTION_PREVIEW_LAYER_ID = "selection-preview";

const PREVIEW_FILL_ALPHA = 40;
const PREVIEW_LINE_ALPHA = 200;
const PREVIEW_LINE_WIDTH_PX = 2;

/**
 * Renders the drag preview as `[id, layer]` pairs for
 * `useOverlayLayers` — a null layer removes it.
 */
export function renderDragPreview(
    rect: DragRect | null,
    map: maplibregl.Map,
    color: string,
): ReadonlyArray<readonly [string, Layer | null]> {
    if (!rect) return [[SELECTION_PREVIEW_LAYER_ID, null]];

    const corners: [number, number][] = [
        [rect.x0, rect.y0],
        [rect.x1, rect.y0],
        [rect.x1, rect.y1],
        [rect.x0, rect.y1],
        [rect.x0, rect.y0],
    ];
    const ring = corners.map(([x, y]) => {
        const lngLat = map.unproject([x, y]);
        return [lngLat.lng, lngLat.lat];
    });
    const feature: Feature = {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {},
    };

    const layer = new GeoJsonLayer({
        id: SELECTION_PREVIEW_LAYER_ID,
        data: [feature],
        pickable: false,
        filled: true,
        stroked: true,
        getFillColor: hexToRgba(color, PREVIEW_FILL_ALPHA),
        getLineColor: hexToRgba(color, PREVIEW_LINE_ALPHA),
        lineWidthUnits: "pixels",
        getLineWidth: PREVIEW_LINE_WIDTH_PX,
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    });
    return [[SELECTION_PREVIEW_LAYER_ID, layer]];
}
