import { useMemo } from "react";
import { useOverlayLayers } from "@core/domain/map/hooks/useOverlayLayers";
import { renderSelectionHighlight } from "@core/domain/map";
import {
    DEFAULT_SELECTION_COLOR,
    SELECTION_COLOR_SETTING_ID,
    ensureSelectionState,
    type SelectionRecord,
} from "@core/common/selection";
import type { StoreRegistry } from "@core/store-registry";

/**
 * Draws the shared selection on the map whenever it is non-empty and the
 * selection color setting — independent of the selection tool's active
 * state, so a selection survives deactivation (QGIS-like).
 */
export function useSelectionHighlight(rootStore: StoreRegistry): void {
    const selection = ensureSelectionState(rootStore);
    const color =
        rootStore.settingsStore.getStringSetting(SELECTION_COLOR_SETTING_ID) ??
        DEFAULT_SELECTION_COLOR;

    // A fresh array identity exactly when a layer's selection changed —
    // the memo dependency; iterating inside tracks the observable map.
    const layerCounts = selection.layerCounts;

    const layers = useMemo(() => {
        const records: SelectionRecord[] = [];
        for (const [layerId, layerSelection] of selection.layers) {
            // A hidden layer's selection stays in the store but is not
            // drawn — visibility is render participation (ADR-0008).
            if (!rootStore.treeStore.node(layerId)?.isVisible) continue;
            records.push(...layerSelection.values());
        }
        return renderSelectionHighlight(records, color);
    }, [layerCounts, color, selection, rootStore]);

    useOverlayLayers(rootStore.mapStore.context?.overlayManager, layers);
}
