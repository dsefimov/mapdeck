/**
 * Pager total for attribute pagination: prefer the server-reported
 * count; otherwise assume a next page exists as long as the page came
 * back full — the fabricated +1 keeps the pager offering "next".
 *
 * @param numberMatched - raw server field; numeric strings are coerced,
 * anything else (including empty/whitespace strings — `Number("")` is 0)
 * counts as "not reported"
 */
export function estimateTotal(
    numberMatched: unknown,
    pageCount: number,
    offset: number,
    pageSize: number,
): number {
    const reported =
        typeof numberMatched === "string" && numberMatched.trim() === ""
            ? null
            : numberMatched;
    const matched = Number(reported);
    if (reported != null && !Number.isNaN(matched)) return matched;

    return pageCount >= pageSize ? offset + pageCount + 1 : offset + pageCount;
}
