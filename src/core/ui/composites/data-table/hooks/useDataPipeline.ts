import { useDeferredValue, useMemo } from "react";
import type { SortDirection } from "../types";
import { applyRowFilters, compareValues } from "../utils";

/** Localized strings — structural, so callers may pass any dictionary. */
type Dict = Record<string, string>;

interface DataPipelineInput {
    rows: Record<string, unknown>[];
    filters: Record<string, string>;
    sortColumn?: string | null;
    sortDirection?: SortDirection;
    dict: Dict;
}

interface DataPipelineResult {
    sortedData: Record<string, unknown>[];
}

/**
 * Filter → sort pipeline. Filtering runs on a deferred copy of the
 * filters so typing stays responsive while every cell of every row is
 * formatted for matching.
 */
export function useDataPipeline(input: DataPipelineInput): DataPipelineResult {
    const { rows, filters, sortColumn, sortDirection, dict } = input;
    const deferredFilters = useDeferredValue(filters);

    const filteredData = useMemo(() => {
        const hasFilters = Object.values(deferredFilters).some(
            (v) => v.length > 0,
        );
        if (!hasFilters) return rows;
        return rows.filter((row) => applyRowFilters(row, deferredFilters, dict));
    }, [rows, deferredFilters, dict]);

    const sortedData = useMemo(() => {
        if (!sortColumn || !sortDirection) return filteredData;
        return [...filteredData].sort((a, b) => {
            const result = compareValues(a[sortColumn], b[sortColumn]);
            return sortDirection === "desc" ? -result : result;
        });
    }, [filteredData, sortColumn, sortDirection]);

    return { sortedData };
}
