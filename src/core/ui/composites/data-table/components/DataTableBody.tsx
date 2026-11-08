import type { ReactNode } from "react";
import { Text } from "../../../components/primitives/text/Text";
import { ColumnarHeaderRow } from "./ColumnarHeaderRow";
import { VisibleRows } from "./VisibleRows";
import type { DataTableLabels, GeometryColumnConfig } from "../types";
import styles from "../AttributeTable.module.css";

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
    startIndex: number;
    endIndex: number;
    topPaddingHeight: number;
    bottomPaddingHeight: number;
    loading: boolean;
    labels: DataTableLabels;
}

export const DataTableBody: (props: DataTableBodyProps) => ReactNode = ({
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
    startIndex,
    endIndex,
    topPaddingHeight,
    bottomPaddingHeight,
    loading,
    labels,
}) => {
    const columnCount =
        (isColumnar ? 1 : 0) +
        (geometryColumn ? 1 : 0) +
        displayColumns.length;

    // KV headers are literals ("attribute"/"value"), not data keys — they
    // localize through the dictionary; columnar headers stay as-is.
    const headerLabels = isColumnar
        ? undefined
        : {
              attribute: labels["dataTable.attribute"],
              value: labels["dataTable.value"],
          };

    return (
        <table
            className={styles.dataTable}
            data-mode={isColumnar ? "columnar" : "kv"}
        >
            <thead>
                <ColumnarHeaderRow
                    columns={displayColumns}
                    headerLabels={headerLabels}
                    showRowNumbers={isColumnar}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    showFilters={showFilters}
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    geometryColumn={geometryColumn}
                    labels={labels}
                />
            </thead>
            <tbody>
                {topPaddingHeight > 0 && (
                    <tr className={styles.spacerRow} data-spacer="">
                        <td
                            colSpan={columnCount}
                            style={{ height: topPaddingHeight }}
                        />
                    </tr>
                )}
                {sortedData.length === 0 && !loading && (
                    <tr>
                        <td colSpan={columnCount}>
                            <Text variant="body" tone="secondary">
                                {labels["dataTable.noMatches"]}
                            </Text>
                        </td>
                    </tr>
                )}
                <VisibleRows
                    sortedData={sortedData}
                    startIndex={startIndex}
                    endIndex={endIndex}
                    displayColumns={displayColumns}
                    showRowNumbers={isColumnar}
                    geometryColumn={geometryColumn}
                    labels={labels}
                />
                {bottomPaddingHeight > 0 && (
                    <tr className={styles.spacerRow} data-spacer="">
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
};
