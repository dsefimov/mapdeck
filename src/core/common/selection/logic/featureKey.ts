/**
 * The feature-key convention shared by the attribute table and map
 * selection: the GeoJSON feature-level id when present (the table reads
 * it as the `_featureId` reserved field), else the first id-like
 * property (id/ID/Id/fid/FID) — `feature-<value>` is the only form that
 * matches across the two surfaces. The fallback prefixes are
 * deliberately surface-local: a table row index and a map pick index
 * number different things, and a shared prefix would sync the wrong
 * rows.
 */

/** The one cross-surface key form. */
export const FEATURE_KEY_PREFIX = "feature-";
/** Table fallback: the row index inside the loaded page. */
export const ROW_KEY_PREFIX = "row-";
/** Map fallback: the pick index. */
export const PICK_KEY_PREFIX = "pick-";

const ID_FIELDS = ["id", "ID", "Id", "fid", "FID"] as const;

function keyOf(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    return `${FEATURE_KEY_PREFIX}${String(value)}`;
}

/** Whether a key is the stable, cross-surface form. */
export function isStableKey(key: string): boolean {
    return key.startsWith(FEATURE_KEY_PREFIX);
}

/**
 * Stable key for a feature: feature-level id first, then id-like
 * properties; null when neither is present.
 */
export function stableFeatureKey(
    properties: Record<string, unknown>,
    featureId?: string | number | null,
): string | null {
    const featureLevel = keyOf(featureId) ?? keyOf(properties["_featureId"]);
    if (featureLevel !== null) return featureLevel;

    for (const field of ID_FIELDS) {
        const key = keyOf(properties[field]);
        if (key !== null) return key;
    }
    return null;
}
