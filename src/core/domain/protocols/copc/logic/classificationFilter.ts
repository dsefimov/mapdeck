/**
 * Resolves a style-metadata value to the hidden point classification
 * codes: only a list of integer LAS codes (0–255) is trusted, deduplicated
 * and sorted so structurally equal sets compare equal; anything else reads
 * as "nothing hidden".
 */
export function resolveHiddenClassifications(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    const codes = new Set<number>();
    for (const item of value) {
        if (
            typeof item === "number" &&
            Number.isInteger(item) &&
            item >= 0 &&
            item <= 255
        ) {
            codes.add(item);
        }
    }
    return [...codes].sort((a, b) => a - b);
}
