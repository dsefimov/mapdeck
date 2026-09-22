import React from "react";
import { Text } from "@core/ui/components/primitives/text/Text";
import type { SortDirection } from "../types";
import { getAriaSort, getSortIndicator } from "../utils";
import styles from "../AttributeTable.module.css";

interface KvHeaderRowProps {
    sortColumn: string | null;
    sortDirection: SortDirection;
    onSort: (column: string) => void;
    showFilters: boolean;
    filters: Record<string, string>;
    onFilterChange: (column: string, value: string) => void;
    dict: Record<string, string>;
}

interface SortableCellProps {
    column: string;
    caption: string;
    sortColumn: string | null;
    sortDirection: SortDirection;
    onSort: (column: string) => void;
}

const SortableCell = ({
    column,
    caption,
    sortColumn,
    sortDirection,
    onSort,
}: SortableCellProps) => (
    <th
        className={styles.sortableHeader}
        aria-sort={getAriaSort(sortColumn === column, sortDirection)}
    >
        <button
            type="button"
            className={styles.sortButton}
            onClick={() => onSort(column)}
        >
            <Text variant="caption">
                {caption}
                {sortColumn === column && (
                    <span className={styles.sortIndicator} aria-hidden="true">
                        {getSortIndicator(sortDirection)}
                    </span>
                )}
            </Text>
        </button>
    </th>
);

export const KvHeaderRow = React.memo<KvHeaderRowProps>(
    ({
        sortColumn,
        sortDirection,
        onSort,
        showFilters,
        filters,
        onFilterChange,
        dict,
    }) => (
        <>
            <tr>
                <SortableCell
                    column="attribute"
                    caption={dict["dataTable.attribute"] ?? "Attribute"}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={onSort}
                />
                <SortableCell
                    column="value"
                    caption={dict["dataTable.value"] ?? "Value"}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={onSort}
                />
            </tr>
            {showFilters && (
                <tr>
                    <th>
                        <input
                            type="text"
                            className={styles.filterInput}
                            placeholder={dict["dataTable.filterAttributes"]}
                            aria-label={dict["dataTable.filterAttributes"]}
                            value={filters.attribute ?? ""}
                            onChange={(e) =>
                                onFilterChange("attribute", e.target.value)
                            }
                        />
                    </th>
                    <th>
                        <input
                            type="text"
                            className={styles.filterInput}
                            placeholder={dict["dataTable.filterValues"]}
                            aria-label={dict["dataTable.filterValues"]}
                            value={filters.value ?? ""}
                            onChange={(e) =>
                                onFilterChange("value", e.target.value)
                            }
                        />
                    </th>
                </tr>
            )}
        </>
    ),
);
KvHeaderRow.displayName = "KvHeaderRow";
