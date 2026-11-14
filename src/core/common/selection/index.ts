import type { StateStore } from "@core/lib/state";
import { SelectionStore, SELECTION_STATE_KEY } from "./SelectionStore";

export { SelectionStore, SELECTION_STATE_KEY } from "./SelectionStore";
export {
    DEFAULT_SELECTION_COLOR,
    SELECTION_COLOR_SETTING_ID,
} from "./constants";
export { stableFeatureKey } from "./logic/featureKey";
export {
    applySelection,
    toggleRecord,
    unionRecordExtents,
    type LayerSelection,
} from "./logic/selectionOps";
export type {
    SelectionFootprint,
    SelectionMode,
    SelectionRecord,
    SelectedGeometry,
} from "./types";

/**
 * The shared selection state, created on first access — the map tool, the
 * attribute table and the map viewer's highlight all converge on the one
 * stateStore instance.
 */
export function ensureSelectionState(rootStore: {
    readonly stateStore: StateStore;
}): SelectionStore {
    return rootStore.stateStore.get(
        SELECTION_STATE_KEY,
        () => new SelectionStore(),
    );
}
