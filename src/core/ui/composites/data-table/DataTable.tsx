import React, { useMemo } from "react";
import { typedDict } from "@core/lib/text";
import { LoadingScreen } from "../../components/feedback/loading-screen/LoadingScreen";
import { Text } from "../../components/primitives/text/Text";
import { KV_COLUMNS, toKvRows } from "./utils";
import { useSortMode } from "./hooks/useSortMode";
import { useFilterState } from "./hooks/useFilterState";
import { useDataPipeline } from "./hooks/useDataPipeline";
import { useVirtualWindow } from "./hooks/useVirtualWindow";
import { TableControls } from "./components/TableControls";
import { DataTableBody } from "./components/DataTableBody";
import { TableEmpty } from "./components/TableEmpty";
import type { DataTableKey, DataTableProps } from "./types";
import styles from "./AttributeTable.module.css";

export {
    type DataTableProps,
    type GeometryColumnConfig,
    type SelectionColumnConfig,
    type ValueRenderer,
} from "./types";

/**
 * Data table with a virtualized window. `columns` selects the columnar
 * view; without it the rows flatten into the key-value view (attribute /
 * value) — one pipeline: flatten → filter → sort. The key-value view
 * starts sorted by attribute and shows no row numbers or zoom column.
 */
export const DataTable = React.memo<DataTableProps>((props) => {
    const {
        rows,
        columns,
        header,
        totalRows,
        loading = false,
        fetchMore,
        onRefresh,
        geometryColumn,
        selection,
        controls,
        valueRenderers,
        onOpenValue,
        pageSize = 50,
        dict,
    } = props;

    const isColumnar = columns !== undefined;
    // One typed view of the dictionary — children receive `labels`, so a
    // typo'd key is a compile error instead of a silent undefined.
    const labels = typedDict<DataTableKey>(dict);

    const { sortColumn, sortDirection, handleSort } = useSortMode(props);

    const {
        filters,
        showFilters,
        toggleShowFilters,
        handleFilterChange,
        clearFilters,
        hasActiveFilters,
    } = useFilterState();

    const displayColumns = useMemo(
        () =>
            isColumnar
                ? columns.filter((col) => col !== geometryColumn?.key)
                : [...KV_COLUMNS],
        [isColumnar, columns, geometryColumn],
    );

    const sourceRows = useMemo(
        () => (isColumnar ? rows : toKvRows(rows)),
        [isColumnar, rows],
    );

    // Sorting and filtering reshuffle the pipeline, so a row's source
    // index — the one its stable key is derived from — is only known
    // here. The map keeps the id attached to the row object itself.
    const rowIds = useMemo(() => {
        if (!selection) return null;
        const ids = new WeakMap<object, string>();
        rows.forEach((row, index) => {
            ids.set(row, selection.getRowId(row, index));
        });
        return ids;
    }, [rows, selection]);

    const { sortedData } = useDataPipeline({
        rows: sourceRows,
        filters,
        sortColumn,
        sortDirection,
        labels,
        valueRenderers,
    });

    // The pinned view keeps the pipeline's order within each group —
    // only the selected/unselected partition moves (QGIS-like).
    const orderedData = useMemo(() => {
        if (!selection?.pinSelectedToTop || !rowIds) return sortedData;
        const selected: Record<string, unknown>[] = [];
        const rest: Record<string, unknown>[] = [];
        for (const row of sortedData) {
            const rowId = rowIds.get(row);
            if (rowId !== undefined && selection.isSelected(rowId)) {
                selected.push(row);
            } else {
                rest.push(row);
            }
        }
        return [...selected, ...rest];
    }, [sortedData, selection, rowIds]);

    const rowCount = orderedData.length;

    const {
        containerRef,
        handleScroll,
        startIndex,
        endIndex,
        topPaddingHeight,
        bottomPaddingHeight,
    } = useVirtualWindow({ rowCount, totalRows, fetchMore, loading, pageSize });

    if (rows.length === 0 && !loading) {
        return (
            <TableEmpty header={header} labels={labels} onRefresh={onRefresh} />
        );
    }

    return (
        <>
            {header && <Text variant="title">{header}</Text>}
            <div className={styles.tableContainer}>
                <TableControls
                    showFilters={showFilters}
                    hasActiveFilters={hasActiveFilters}
                    onToggleFilters={toggleShowFilters}
                    onClearFilters={clearFilters}
                    labels={labels}
                >
                    {controls}
                </TableControls>
                <div
                    ref={containerRef}
                    className={styles.scrollContainer}
                    onScroll={handleScroll}
                    data-mode={isColumnar ? "columnar" : undefined}
                >
                    <DataTableBody
                        isColumnar={isColumnar}
                        displayColumns={displayColumns}
                        geometryColumn={geometryColumn}
                        selection={isColumnar ? selection : undefined}
                        rowIds={rowIds}
                        valueRenderers={valueRenderers}
                        onOpenValue={onOpenValue}
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        handleSort={handleSort}
                        showFilters={showFilters}
                        filters={filters}
                        handleFilterChange={handleFilterChange}
                        sortedData={orderedData}
                        startIndex={startIndex}
                        endIndex={endIndex}
                        topPaddingHeight={topPaddingHeight}
                        bottomPaddingHeight={bottomPaddingHeight}
                        loading={loading}
                        labels={labels}
                        dict={dict}
                    />
                    {loading && (
                        <div className={styles.loadingContainer}>
                            <LoadingScreen label={labels["dataTable.loading"]} />
                        </div>
                    )}
                </div>
            </div>
        </>
    );
});
DataTable.displayName = "DataTable";
