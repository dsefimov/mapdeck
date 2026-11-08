import type { ReactNode } from "react";
import { Button } from "../../../components/primitives/button/Button";
import type { DataTableLabels } from "../types";
import styles from "../AttributeTable.module.css";

interface TableControlsProps {
    showFilters: boolean;
    hasActiveFilters: boolean;
    onToggleFilters: () => void;
    onClearFilters: () => void;
    labels: DataTableLabels;
}

export const TableControls: (props: TableControlsProps) => ReactNode = ({
    showFilters,
    hasActiveFilters,
    onToggleFilters,
    onClearFilters,
    labels,
}) => (
    <div className={styles.controls}>
        <Button size="sm" onClick={onToggleFilters}>
            {showFilters
                ? labels["dataTable.hide"]
                : labels["dataTable.show"]}{" "}
            {labels["dataTable.filters"]}
        </Button>
        {hasActiveFilters && (
            <Button size="sm" onClick={onClearFilters}>
                {labels["dataTable.clearFilters"]}
            </Button>
        )}
    </div>
);
