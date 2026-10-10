/**
 * Distinct column names across features. `_`-prefixed keys are excluded:
 * they are the FeatureRow reserved-key convention and carry
 * spatial metadata, not data columns.
 */
export function extractColumns(
    features: readonly Record<string, unknown>[],
): string[] {
    // `_`-prefixed keys are the FeatureRow reserved-key convention
    // — they carry spatial metadata, not data columns.
    const colSet = new Set<string>();
    for (const f of features) {
        for (const k of Object.keys(f)) {
            if (!k.startsWith("_")) colSet.add(k);
        }
    }
    return Array.from(colSet);
}
