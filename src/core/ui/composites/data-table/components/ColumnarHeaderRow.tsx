import React from "react";
import { Icon } from "@core/ui/components";
import type { TranslationDict } from "@core/framework/types";
import type { SortDirection, GeometryColumnConfig } from "../types";
import { getSortIndicator } from "../utils";
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
    dict: TranslationDict;
}

export const ColumnarHeaderRow: React.FC<ColumnarHeaderRowProps> = React.memo(
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
                    {dict["attributeTable.rowNumber"]}
                </th>
                {geometryColumn && (
                    <th
                        className={styles.zoomColumnHeader}
                        aria-label={dict["attributeTable.zoomToObject"]}
                    >
                        <Icon name="zoom" />
                    </th>
                )}
                {columns.map((col) => (
                    <th
                        key={col}
                        className={styles.sortableHeader}
                        style={{ minWidth: 80 }}
                        onClick={() => onSort(col)}
                    >
                        {col}
                        {sortColumn === col && (
                            <span className={styles.sortIndicator}>
                                {getSortIndicator(sortDirection)}
                            </span>
                        )}
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
                                placeholder={
                                    dict[
                                        "attributeTable.filterColumn"
                                    ]?.replace("{column}", col) ?? ""
                                }
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
