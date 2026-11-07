import { typedDict } from "@core/lib/text";
import type { SortDirection } from "./types";

/** Localized strings — structural, so callers may pass any dictionary. */
type Dict = Record<string, string>;

/** One comparison locale for the whole module — not per pair. */
const COLLATOR = new Intl.Collator();

/** Keys formatValue reads — typed view, no fallbacks (ADR-0015). */
type FormatKey = "dataTable.nullValue" | "dataTable.yes" | "dataTable.no";

function formatBoolean(
    value: boolean,
    labels: Record<FormatKey, string>,
): string {
    return value ? labels["dataTable.yes"] : labels["dataTable.no"];
}

function formatNumber(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/**
 * Render a cell value for display: booleans and nulls localized through the
 * dictionary, arrays joined, objects JSON-serialized.
 */
export function formatValue(value: unknown, dict: Dict): string {
    const labels = typedDict<FormatKey>(dict);
    if (value == null) return labels["dataTable.nullValue"];
    if (typeof value === "boolean") return formatBoolean(value, labels);
    if (typeof value === "number") return formatNumber(value);
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return `[${value.join(", ")}]`;
    if (typeof value === "object") return JSON.stringify(value);
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

/** Total-order comparison for mixed cell values: nulls sort last, numbers
 * numerically, everything else by one shared collator. */
export function compareValues(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return COLLATOR.compare(String(a), String(b));
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

/** Column names of the key-value view. */
export const KV_COLUMNS = ["attribute", "value"] as const;

export type KvRow = { attribute: string; value: unknown };

/**
 * Flatten rows into key/value rows (reserved `_`-keys dropped), sorted
 * alphabetically by attribute — the KV view's default order. The `_`
 * prefix is the FeatureRow reserved-key convention — ui cannot import
 * the contract, so the convention is restated here.
 */
export function toKvRows(rows: Record<string, unknown>[]): KvRow[] {
    return rows
        .flatMap((row) => Object.entries(row))
        .filter(([key]) => !key.startsWith("_"))
        .map(([attribute, value]) => ({ attribute, value }))
        .sort((a, b) => COLLATOR.compare(a.attribute, b.attribute));
}
