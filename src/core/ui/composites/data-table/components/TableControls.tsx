import React from "react";
import type { TranslationDict } from "@core/framework/types";
import styles from "../AttributeTable.module.css";

interface TableControlsProps {
    showFilters: boolean;
    hasActiveFilters: boolean;
    onToggleFilters: () => void;
    onClearFilters: () => void;
    dict: TranslationDict;
}

export const TableControls: React.FC<TableControlsProps> = React.memo(
    ({
        showFilters,
        hasActiveFilters,
        onToggleFilters,
        onClearFilters,
        dict,
    }) => (
        <div className={styles.controls}>
            <button
                type="button"
                className={styles.controlButton}
                onClick={onToggleFilters}
            >
                {showFilters
                    ? dict["attributeTable.hide"]
                    : dict["attributeTable.show"]}{" "}
                {dict["attributeTable.filters"]}
            </button>
            {hasActiveFilters && (
                <button
                    type="button"
                    className={styles.controlButton}
                    onClick={onClearFilters}
                >
                    {dict["attributeTable.clearFilters"]}
                </button>
            )}
        </div>
    ),
);
TableControls.displayName = "TableControls";
