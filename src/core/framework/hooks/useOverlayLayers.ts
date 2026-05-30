/**
 * Hook that syncs a set of Deck.gl layers with the overlay manager.
 * Each render updates layers; cleanup removes them on unmount.
 */
import { useEffect } from "react";
import type { Layer } from "@deck.gl/core";
import type { DeckOverlayManager } from "@core/domain/overlay";

/**
 * @param overlayManager - The overlay manager instance
 * @param layers - Array of [layerId, layer | null] tuples.
 *  null removes the layer, a Layer instance adds it.
 *  The array reference is used as the dependency — stable it with useMemo.
 */
export function useOverlayLayers(
    overlayManager: DeckOverlayManager,
    layers: ReadonlyArray<readonly [string, Layer | null]>,
): void {
    useEffect(() => {
        for (const [id, layer] of layers) {
            if (layer) overlayManager.addLayer(id, layer);
            else overlayManager.removeLayer(id);
        }
        return () => {
            for (const [id] of layers) overlayManager.removeLayer(id);
        };
    }, [overlayManager, layers]);
}
