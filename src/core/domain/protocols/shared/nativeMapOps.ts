import type maplibregl from "maplibre-gl";

/**
 * Native MapLibre layer-source operations shared by the protocol adapters
 * (Raster, Vector): each checks existence before touching the map, so an
 * absent layer is a no-op, never an exception.
 */

/** Remove the layer and its source when they exist under `layerId`. */
export function removeNativeLayerSource(
    map: maplibregl.Map,
    layerId: string,
): void {
    if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
    }
    if (map.getSource(layerId)) {
        map.removeSource(layerId);
    }
}

/** Set native layer visibility; absent layers stay untouched. */
export function setNativeVisibility(
    map: maplibregl.Map,
    layerId: string,
    visible: boolean,
): void {
    if (map.getLayer(layerId)) {
        map.setLayoutProperty(
            layerId,
            "visibility",
            visible ? "visible" : "none",
        );
    }
}
