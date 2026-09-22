import React from "react";
import { Button } from "@core/ui/components/primitives/button/Button";
import styles from "../AttributeTable.module.css";

interface TableControlsProps {
    showFilters: boolean;
    hasActiveFilters: boolean;
    onToggleFilters: () => void;
    onClearFilters: () => void;
    dict: Record<string, string>;
}

export const TableControls = React.memo<TableControlsProps>(
    ({
        showFilters,
        hasActiveFilters,
        onToggleFilters,
        onClearFilters,
        dict,
    }) => (
        <div className={styles.controls}>
            <Button size="sm" onClick={onToggleFilters}>
                {showFilters
                    ? dict["dataTable.hide"]
                    : dict["dataTable.show"]}{" "}
                {dict["dataTable.filters"]}
            </Button>
            {hasActiveFilters && (
                <Button size="sm" onClick={onClearFilters}>
                    {dict["dataTable.clearFilters"]}
                </Button>
            )}
        </div>
    ),
);
TableControls.displayName = "TableControls";
