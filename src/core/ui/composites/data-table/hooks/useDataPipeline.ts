import { useDeferredValue, useMemo } from "react";
import type { SortDirection, DataTableLabels, ValueRenderer } from "../types";
import { applyRowFilters, compareValues } from "../utils";

interface DataPipelineInput {
    rows: Record<string, unknown>[];
    filters: Record<string, string>;
    sortColumn?: string | null;
    sortDirection?: SortDirection;
    labels: DataTableLabels;
    valueRenderers?: readonly ValueRenderer[] | undefined;
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
    const { rows, filters, sortColumn, sortDirection, labels, valueRenderers } =
        input;
    const deferredFilters = useDeferredValue(filters);

    const filteredData = useMemo(() => {
        const hasFilters = Object.values(deferredFilters).some(
            (v) => v.length > 0,
        );
        if (!hasFilters) return rows;
        return rows.filter((row) =>
            applyRowFilters(row, deferredFilters, labels, valueRenderers),
        );
    }, [rows, deferredFilters, labels, valueRenderers]);

    const sortedData = useMemo(() => {
        if (!sortColumn || !sortDirection) return filteredData;
        return [...filteredData].sort((a, b) => {
            const result = compareValues(a[sortColumn], b[sortColumn]);
            return sortDirection === "desc" ? -result : result;
        });
    }, [filteredData, sortColumn, sortDirection]);

    return { sortedData };
}
