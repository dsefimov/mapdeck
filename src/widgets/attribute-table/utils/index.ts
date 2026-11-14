import { stableFeatureKey } from "@core/common/selection";

/** A layer selectable in the attribute table, with its owning group title if any. */
export interface AttributeLayerInfo {
    id: string;
    title: string;
    groupTitle: string | null;
}

/**
 * Stable row key for a feature — the shared selection key convention
 * (`_featureId` or an id-like field), falling back to the row index.
 */
export function getFeatureId(
    feature: Record<string, unknown>,
    index: number,
): string {
    return stableFeatureKey(feature) ?? `row-${index}`;
}

export { buildAttributeLayers } from "./buildAttributeLayers";
export { extractColumns } from "./extractColumns";
export { groupLayersByTitle } from "./groupLayersByTitle";
export {
    mergeAttributePage,
    type AttributePage,
} from "./mergeAttributePage";
export { attributeCacheKey } from "./attributeCacheKey";
