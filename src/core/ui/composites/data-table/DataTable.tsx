import React, { useMemo } from "react";
import { LoadingScreen } from "@core/ui/components";
import { formatValue } from "./utils";
import { useSortMode } from "./hooks/useSortMode";
import { useFilterState } from "./hooks/useFilterState";
import { useDataPipeline } from "./hooks/useDataPipeline";
import { useVirtualWindow } from "./hooks/useVirtualWindow";
import { EmptyState } from "./components/EmptyState";
import { TableControls } from "./components/TableControls";
import { ColumnarHeaderRow } from "./components/ColumnarHeaderRow";
import { ColumnarRow } from "./components/ColumnarRow";
import { KvHeaderRow } from "./components/KvHeaderRow";
import type { DataTableProps, GeometryColumnConfig } from "./types";
import styles from "./AttributeTable.module.css";

export { type DataTableProps, type GeometryColumnConfig } from "./types";

// ── ColumnarVisibleRows ──────────────────────────────────────────────────────

interface ColumnarVisibleRowsProps {
    sortedData: Record<string, unknown>[];
    startIndex: number;
    endIndex: number;
    rowCount: number;
    displayColumns: string[];
    loading: boolean;
    geometryColumn: GeometryColumnConfig | undefined;
    dict: Record<string, string>;
}

export const ColumnarVisibleRows = React.memo<ColumnarVisibleRowsProps>(
    ({
        sortedData,
        startIndex,
        endIndex,
        rowCount,
        displayColumns,
        loading,
        geometryColumn,
        dict,
    }) => {
        const sliced = sortedData.slice(startIndex, endIndex);
        return sliced.map((row, index) => {
            const globalIdx = startIndex + index;
            return (
                <ColumnarRow
                    key={`row-${globalIdx}`}
                    row={row}
                    globalIdx={globalIdx}
                    isLoaded={globalIdx < rowCount}
                    columns={displayColumns}
                    loading={loading}
                    geometryColumn={geometryColumn}
                    dict={dict}
                />
            );
        });
    },
);
ColumnarVisibleRows.displayName = "ColumnarVisibleRows";

// ── KvVisibleRows ────────────────────────────────────────────────────────────

interface KvVisibleRowsProps {
    sortedKvEntries: [string, unknown][];
    startIndex: number;
    endIndex: number;
    dict: Record<string, string>;
}

export const KvVisibleRows = React.memo<KvVisibleRowsProps>(
    ({ sortedKvEntries, startIndex, endIndex, dict }) => {
        const sliced = sortedKvEntries.slice(startIndex, endIndex);
        return sliced.map(([key, value], index) => (
            <tr key={`${key}-${startIndex + index}`}>
                <td>{key}</td>
                <td>{formatValue(value, dict)}</td>
            </tr>
        ));
    },
);
KvVisibleRows.displayName = "KvVisibleRows";

// ── DataTableBody ─────────────────────────────────────────────────────────

interface DataTableBodyProps {
    isColumnar: boolean;
    displayColumns: string[];
    geometryColumn: GeometryColumnConfig | undefined;
    sortColumn: string | null;
    sortDirection: "asc" | "desc" | null;
    handleSort: (column: string) => void;
    showFilters: boolean;
    filters: Record<string, string>;
    handleFilterChange: (column: string, value: string) => void;
    sortedData: Record<string, unknown>[];
    sortedKvEntries: [string, unknown][];
    startIndex: number;
    endIndex: number;
    rowCount: number;
    topPaddingHeight: number;
    bottomPaddingHeight: number;
    loading: boolean;
    dict: Record<string, string>;
}

const DataTableBody = React.memo<DataTableBodyProps>(
    ({
        isColumnar,
        displayColumns,
        geometryColumn,
        sortColumn,
        sortDirection,
        handleSort,
        showFilters,
        filters,
        handleFilterChange,
        sortedData,
        sortedKvEntries,
        startIndex,
        endIndex,
        rowCount,
        topPaddingHeight,
        bottomPaddingHeight,
        loading,
        dict,
    }) => {
        const geometryOffset = geometryColumn ? 1 : 0;
        const columnCount = isColumnar
            ? 1 + geometryOffset + displayColumns.length
            : 2;

        return (
            <table
                className={styles.dataTable}
                data-mode={isColumnar ? "columnar" : "kv"}
            >
                <thead>
                    {isColumnar ? (
                        <ColumnarHeaderRow
                            columns={displayColumns}
                            sortColumn={sortColumn}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            showFilters={showFilters}
                            filters={filters}
                            onFilterChange={handleFilterChange}
                            geometryColumn={geometryColumn}
                            dict={dict}
                        />
                    ) : (
                        <KvHeaderRow
                            sortColumn={sortColumn}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            showFilters={showFilters}
                            filters={filters}
                            onFilterChange={handleFilterChange}
                            dict={dict}
                        />
                    )}
                </thead>
                <tbody>
                    {topPaddingHeight > 0 && (
                        <tr className={styles.spacerRow}>
                            <td
                                colSpan={columnCount}
                                style={{ height: topPaddingHeight }}
                            />
                        </tr>
                    )}
                    {isColumnar ? (
                        <ColumnarVisibleRows
                            sortedData={sortedData}
                            startIndex={startIndex}
                            endIndex={endIndex}
                            rowCount={rowCount}
                            displayColumns={displayColumns}
                            loading={loading}
                            geometryColumn={geometryColumn}
                            dict={dict}
                        />
                    ) : (
                        <KvVisibleRows
                            sortedKvEntries={sortedKvEntries}
                            startIndex={startIndex}
                            endIndex={endIndex}
                            dict={dict}
                        />
                    )}
                    {bottomPaddingHeight > 0 && (
                        <tr className={styles.spacerRow}>
                            <td
                                colSpan={columnCount}
                                style={{
                                    height: bottomPaddingHeight,
                                }}
                            />
                        </tr>
                    )}
                </tbody>
            </table>
        );
    },
);
DataTableBody.displayName = "DataTableBody";

// ── DataTable ──────────────────────────────────────────────────────────────

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

    const { sortColumn, sortDirection, handleSort } = useSortMode(props);

    const {
        filters,
        showFilters,
        toggleShowFilters,
        handleFilterChange,
        clearFilters,
        hasActiveFilters,
    } = useFilterState();

    const isColumnar = columns !== undefined;

    const displayColumns = useMemo(
        () => columns?.filter((col) => col !== geometryColumn?.key) ?? [],
        [columns, geometryColumn],
    );

    const { sortedData, sortedKvEntries } = useDataPipeline({
        rows,
        filters,
        sortColumn,
        sortDirection,
        dict,
    });

    const rowCount = isColumnar ? sortedData.length : sortedKvEntries.length;

    const {
        containerRef,
        handleScroll,
        startIndex,
        endIndex,
        topPaddingHeight,
        bottomPaddingHeight,
    } = useVirtualWindow({ rowCount, totalRows, fetchMore, loading, pageSize });

    if (rowCount === 0 && !loading) {
        return (
            <>
                {header && <div className={styles.header}>{header}</div>}
                <div className={styles.tableContainer}>
                    <EmptyState
                        header={header}
                        onRefresh={onRefresh}
                        dict={dict}
                    />
                </div>
            </>
        );
    }

    return (
        <>
            {header && <div className={styles.header}>{header}</div>}
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
                        sortedKvEntries={sortedKvEntries}
                        startIndex={startIndex}
                        endIndex={endIndex}
                        rowCount={rowCount}
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
