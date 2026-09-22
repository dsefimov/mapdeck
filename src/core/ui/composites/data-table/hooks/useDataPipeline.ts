import { useMemo } from "react";
import type { SortDirection } from "../types";
import { applyRowFilters, applyKvSorting, compareValues } from "../utils";

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
    sortedKvEntries: [string, unknown][];
}

export function useDataPipeline(input: DataPipelineInput): DataPipelineResult {
    const { rows, filters, sortColumn, sortDirection, dict } = input;

    const filteredData = useMemo(() => {
        const hasFilters = Object.values(filters).some((v) => v.length > 0);
        if (!hasFilters) return rows;
        return rows.filter((row) => applyRowFilters(row, filters, dict));
    }, [rows, filters, dict]);

    const sortedData = useMemo(() => {
        if (!sortColumn || !sortDirection) return filteredData;
        return [...filteredData].sort((a, b) => {
            const result = compareValues(a[sortColumn], b[sortColumn]);
            return sortDirection === "desc" ? -result : result;
        });
    }, [filteredData, sortColumn, sortDirection]);

    const sortedKvEntries = useMemo(
        () => applyKvSorting(sortedData, sortColumn, sortDirection),
        [sortedData, sortColumn, sortDirection],
    );

    return { sortedData, sortedKvEntries };
}
