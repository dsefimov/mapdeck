/**
 * Hook that syncs a set of Deck.gl layers with the overlay manager.
 * Each render updates layers; cleanup removes them on unmount.
 */
import { useEffect } from "react";
import type { Layer } from "@deck.gl/core";
import type { OverlayManager } from "@core/contracts/domain/map-context";

/**
 * @param overlayManager - The overlay manager instance; undefined (no map
 *  yet) skips the wiring until one arrives
 * @param layers - Array of [layerId, layer | null] tuples.
 *  null removes the layer, a Layer instance adds it.
 *  The array reference is used as the dependency — stable it with useMemo.
 */
export function useOverlayLayers(
    overlayManager: OverlayManager<Layer> | undefined,
    layers: ReadonlyArray<readonly [string, Layer | null]>,
): void {
    useEffect(() => {
        if (!overlayManager) return;
        for (const [id, layer] of layers) {
            if (layer) overlayManager.addLayer(id, layer);
            else overlayManager.removeLayer(id);
        }
        return () => {
            for (const [id] of layers) overlayManager.removeLayer(id);
        };
    }, [overlayManager, layers]);
}
