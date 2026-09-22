import React from "react";
import { formatDict } from "@core/lib/text";
import { Icon } from "@core/ui/components";
import { Text } from "@core/ui/components/primitives/text/Text";
import type { SortDirection, GeometryColumnConfig } from "../types";
import { getAriaSort, getSortIndicator } from "../utils";
import styles from "../AttributeTable.module.css";

interface ColumnarHeaderRowProps {
    columns: string[];
    sortColumn: string | null;
    sortDirection: SortDirection;
    onSort: (column: string) => void;
    showFilters: boolean;
    filters: Record<string, string>;
    onFilterChange: (column: string, value: string) => void;
    geometryColumn?: GeometryColumnConfig | undefined;
    dict: Record<string, string>;
}

export const ColumnarHeaderRow = React.memo<ColumnarHeaderRowProps>(
    ({
        columns,
        sortColumn,
        sortDirection,
        onSort,
        showFilters,
        filters,
        onFilterChange,
        geometryColumn,
        dict,
    }) => (
        <>
            <tr>
                <th className={styles.rowNumberHeader}>
                    <Text variant="caption">
                        {dict["dataTable.rowNumber"]}
                    </Text>
                </th>
                {geometryColumn && (
                    <th
                        className={styles.zoomColumnHeader}
                        aria-label={dict["dataTable.zoomToObject"]}
                    >
                        <Icon name="zoom" />
                    </th>
                )}
                {columns.map((col) => (
                    <th
                        key={col}
                        className={styles.sortableHeader}
                        style={{ minWidth: 80 }}
                        aria-sort={getAriaSort(
                            sortColumn === col,
                            sortDirection,
                        )}
                    >
                        <button
                            type="button"
                            className={styles.sortButton}
                            onClick={() => onSort(col)}
                        >
                            <Text variant="caption">
                                {col}
                                {sortColumn === col && (
                                    <span
                                        className={styles.sortIndicator}
                                        aria-hidden="true"
                                    >
                                        {getSortIndicator(sortDirection)}
                                    </span>
                                )}
                            </Text>
                        </button>
                    </th>
                ))}
            </tr>
            {showFilters && (
                <tr>
                    <th />
                    {geometryColumn && <th />}
                    {columns.map((col) => (
                        <th key={col}>
                            <input
                                type="text"
                                className={styles.filterInput}
                                placeholder={formatDict(
                                    dict["dataTable.filterColumn"] ?? "",
                                    { column: col },
                                )}
                                aria-label={formatDict(
                                    dict["dataTable.filterColumn"] ?? "",
                                    { column: col },
                                )}
                                value={filters[col] ?? ""}
                                onChange={(e) =>
                                    onFilterChange(col, e.target.value)
                                }
                            />
                        </th>
                    ))}
                </tr>
            )}
        </>
    ),
);
ColumnarHeaderRow.displayName = "ColumnarHeaderRow";
