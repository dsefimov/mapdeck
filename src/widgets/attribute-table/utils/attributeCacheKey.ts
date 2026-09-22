/**
 * Cache key of a layer's attribute page under the active sort: same
 * layer under a different sort is a different page — colliding them
 * would serve stale rows.
 */
export function attributeCacheKey(
    layerId: string,
    sort: { sortBy: string; sortDirection: "asc" | "desc" } | undefined,
): string {
    const parts = [layerId];
    if (sort) {
        parts.push(`s:${sort.sortBy}:${sort.sortDirection}`);
    }
    return parts.join("|");
}
