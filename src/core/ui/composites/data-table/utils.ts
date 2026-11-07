import { typedDict } from "@core/lib/text";
import type { SortDirection } from "./types";

/** Localized strings — structural, so callers may pass any dictionary. */
type Dict = Record<string, string>;


function formatNumber(value: number): string {
    if (Math.abs(value) >= 1_000_000) return value.toExponential(4);
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/** Keys formatValue reads — typed view, no fallbacks (ADR-0015). */
type FormatKey = "dataTable.nullValue" | "dataTable.yes" | "dataTable.no";

function formatBoolean(
    value: boolean,
    labels: Record<FormatKey, string>,
): string {
    return value ? labels["dataTable.yes"] : labels["dataTable.no"];
}

/**
 * Render a cell value for display: booleans and nulls localized through the
 * dictionary, large numbers exponentiated, arrays joined, objects JSON-pretty-printed.
 */
export function formatValue(value: unknown, dict: Dict): string {
    const labels = typedDict<FormatKey>(dict);
    if (value == null) return labels["dataTable.nullValue"];
    if (typeof value === "boolean") return formatBoolean(value, labels);
    if (typeof value === "number") return formatNumber(value);
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return `[${value.join(", ")}]`;
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
}

/** Sort-direction arrow for a column header; empty string when unsorted. */
export function getSortIndicator(direction: SortDirection): string {
    if (direction === "asc") return " ↑";
    if (direction === "desc") return " ↓";
    return "";
}

/**
 * aria-sort value for a column header: the direction when the column is
 * the active sort key, absent otherwise (per the WAI-ARIA table pattern).
 */
export function getAriaSort(
    isActive: boolean,
    direction: SortDirection,
): "ascending" | "descending" | undefined {
    if (!isActive) return undefined;
    return direction === "asc" ? "ascending" : "descending";
}


/**
 * Total-order comparison for mixed cell values: nulls sort last, numbers
 * numerically, everything else by localized string.
 */
export function compareValues(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
}


/**
 * Whether a row passes the active per-column filters (case-insensitive
 * substrings over the formatted cell values).
 */
export function applyRowFilters(
    row: Record<string, unknown>,
    filters: Record<string, string>,
    dict: Dict,
): boolean {
    return Object.entries(filters)
        .filter(([, filterVal]) => filterVal.length > 0)
        .every(([col, filterVal]) =>
            formatValue(row[col], dict).toLowerCase().includes(filterVal.toLowerCase()),
        );
}


/**
 * Flatten rows into `[attribute, value]` pairs (reserved `_`-keys dropped)
 * and sort them: alphabetically by attribute, or by the selected column
 * when a key-value sort is active.
 */
export function applyKvSorting(
    rows: Record<string, unknown>[],
    sortColumn?: string | null,
    sortDirection?: SortDirection,
): [string, unknown][] {
    // flatMap + filter already produces a new array — no extra copy needed.
    // The `_` prefix is the FeatureRow reserved-key convention —
    // ui cannot import the contract, so the convention is restated here.
    const entries = rows
        .flatMap(Object.entries)
        .filter(([key]) => !key.startsWith("_"));

    if (!sortColumn || !sortDirection) {
        return entries.sort((a, b) => a[0].localeCompare(b[0]));
    }

    return entries.sort((a, b) => {
        const aVal = sortColumn === "attribute" ? a[0] : a[1];
        const bVal = sortColumn === "attribute" ? b[0] : b[1];
        const result = compareValues(aVal, bVal);
        return sortDirection === "desc" ? -result : result;
    });
}
