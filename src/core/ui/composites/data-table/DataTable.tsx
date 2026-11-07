import React, { useMemo } from "react";
import { LoadingScreen } from "@core/ui/components";
import { Text } from "@core/ui/components/primitives/text/Text";
import { KV_COLUMNS, toKvRows } from "./utils";
import { useSortMode } from "./hooks/useSortMode";
import { useFilterState } from "./hooks/useFilterState";
import { useDataPipeline } from "./hooks/useDataPipeline";
import { useVirtualWindow } from "./hooks/useVirtualWindow";
import { TableControls } from "./components/TableControls";
import { DataTableBody } from "./components/DataTableBody";
import { TableEmpty } from "./components/TableEmpty";
import type { DataTableProps } from "./types";
import styles from "./AttributeTable.module.css";

export { type DataTableProps, type GeometryColumnConfig } from "./types";

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
        pageSize = 50,
        dict,
    } = props;

    const isColumnar = columns !== undefined;

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

    const { sortedData } = useDataPipeline({
        rows: sourceRows,
        filters,
        sortColumn,
        sortDirection,
        dict,
    });

    const rowCount = sortedData.length;

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
            <TableEmpty header={header} dict={dict} onRefresh={onRefresh} />
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
                    dict={dict}
                />
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
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        handleSort={handleSort}
                        showFilters={showFilters}
                        filters={filters}
                        handleFilterChange={handleFilterChange}
                        sortedData={sortedData}
                        startIndex={startIndex}
                        endIndex={endIndex}
                        topPaddingHeight={topPaddingHeight}
                        bottomPaddingHeight={bottomPaddingHeight}
                        loading={loading}
                        dict={dict}
                    />
                    {loading && (
                        <div className={styles.loadingContainer}>
                            <LoadingScreen />
                        </div>
                    )}
                </div>
            </div>
        </>
    );
});
DataTable.displayName = "DataTable";
