/** A layer selectable in the attribute table, with its owning group title if any. */
export interface AttributeLayerInfo {
    id: string;
    title: string;
    groupTitle: string | null;
}

/**
 * Stable row key for a feature: the first id-like field it carries
 * (id/ID/Id/fid/FID), falling back to the row index.
 */
export function getFeatureId(
    feature: Record<string, unknown>,
    index: number,
): string {
    const id =
        feature.id ?? feature.ID ?? feature.Id ?? feature.fid ?? feature.FID;
    if (id !== undefined) return `feature-${id}`;
    return `row-${index}`;
}

export { buildAttributeLayers } from "./buildAttributeLayers";
export { extractColumns } from "./extractColumns";
export { groupLayersByTitle } from "./groupLayersByTitle";
export {
    mergeAttributePage,
    type AttributePage,
} from "./mergeAttributePage";
export { attributeCacheKey } from "./attributeCacheKey";
