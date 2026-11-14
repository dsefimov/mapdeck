import type { ReactNode } from "react";
import { interpolate } from "@core/lib/text";
import { Icon } from "../../../components/primitives/icon/Icon";
import { Text } from "../../../components/primitives/text/Text";
import type {
    SortDirection,
    GeometryColumnConfig,
    DataTableLabels,
} from "../types";
import { getAriaSort, getSortIndicator } from "../utils";
import styles from "../AttributeTable.module.css";

interface ColumnarHeaderRowProps {
    columns: string[];
    /** Display names for literal columns (the KV view's attribute/value). */
    headerLabels?: Record<string, string> | undefined;
    showRowNumbers?: boolean;
    sortColumn: string | null;
    sortDirection: SortDirection;
    onSort: (column: string) => void;
    showFilters: boolean;
    filters: Record<string, string>;
    onFilterChange: (column: string, value: string) => void;
    geometryColumn?: GeometryColumnConfig | undefined;
    hasSelectionColumn?: boolean;
    labels: DataTableLabels;
}

export const ColumnarHeaderRow: (
    props: ColumnarHeaderRowProps,
) => ReactNode = ({
    columns,
    headerLabels,
    showRowNumbers = true,
    sortColumn,
    sortDirection,
    onSort,
    showFilters,
    filters,
    onFilterChange,
    geometryColumn,
    hasSelectionColumn,
    labels,
}) => (
    <>
        <tr>
            {showRowNumbers && (
                <th className={styles.rowNumberHeader}>
                    <Text variant="caption">
                        {labels["dataTable.rowNumber"]}
                    </Text>
                </th>
            )}
            {hasSelectionColumn && (
                <th className={styles.selectionColumnHeader} />
            )}
            {geometryColumn && (
                <th
                    className={styles.zoomColumnHeader}
                    aria-label={labels["dataTable.zoomToObject"]}
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
                            {headerLabels?.[col] ?? col}
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
                {showRowNumbers && <th />}
                {hasSelectionColumn && <th />}
                {geometryColumn && <th />}
                {columns.map((col) => (
                    <th key={col}>
                        <input
                            type="text"
                            className={styles.filterInput}
                            placeholder={interpolate(
                                labels["dataTable.filterColumn"] ?? "",
                                { column: col },
                            )}
                            aria-label={interpolate(
                                labels["dataTable.filterColumn"] ?? "",
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
);
