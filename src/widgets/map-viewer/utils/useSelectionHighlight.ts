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
 * state, so a selection survives deactivation (QGIS-like). Computed
 * fresh each render: every tracked read — layerCounts, per-node
 * visibility, the color setting — is a dependency of the result, and the
 * map viewer re-renders only on observable changes (the overlay manager
 * batches the layer updates).
 */
export function useSelectionHighlight(rootStore: StoreRegistry): void {
    const selection = ensureSelectionState(rootStore);
    const color =
        rootStore.settingsStore.getStringSetting(SELECTION_COLOR_SETTING_ID) ??
        DEFAULT_SELECTION_COLOR;

    // A hidden layer's selection stays in the store but is not drawn —
    // visibility is render participation (ADR-0008).
    const records: SelectionRecord[] = [];
    for (const [layerId, layerSelection] of selection.layers) {
        if (rootStore.treeStore.node(layerId)?.isVisible !== true) continue;
        records.push(...layerSelection.values());
    }

    useOverlayLayers(
        rootStore.mapStore.context?.overlayManager,
        renderSelectionHighlight(records, color),
    );
}
