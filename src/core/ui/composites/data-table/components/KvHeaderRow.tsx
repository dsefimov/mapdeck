import React from "react";
import type { TranslationDict } from "@core/framework/types";
import type { SortDirection } from "../types";
import { getSortIndicator } from "../utils";
import styles from "../AttributeTable.module.css";

interface KvHeaderRowProps {
    sortColumn: string | null;
    sortDirection: SortDirection;
    onSort: (column: string) => void;
    showFilters: boolean;
    filters: Record<string, string>;
    onFilterChange: (column: string, value: string) => void;
    dict: TranslationDict;
}

export const KvHeaderRow: React.FC<KvHeaderRowProps> = React.memo(
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
                <th
                    className={styles.sortableHeader}
                    onClick={() => onSort("attribute")}
                >
                    {dict["attributeTable.attribute"] ?? "Attribute"}
                    {sortColumn === "attribute" && (
                        <span className={styles.sortIndicator}>
                            {getSortIndicator(sortDirection)}
                        </span>
                    )}
                </th>
                <th
                    className={styles.sortableHeader}
                    onClick={() => onSort("value")}
                >
                    {dict["attributeTable.value"] ?? "Value"}
                    {sortColumn === "value" && (
                        <span className={styles.sortIndicator}>
                            {getSortIndicator(sortDirection)}
                        </span>
                    )}
                </th>
            </tr>
            {showFilters && (
                <tr>
                    <th>
                        <input
                            type="text"
                            className={styles.filterInput}
                            placeholder={
                                dict["attributeTable.filterAttributes"]
                            }
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
                            placeholder={dict["attributeTable.filterValues"]}
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
