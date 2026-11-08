import { Button } from "../../../components/primitives/button/Button";
import styles from "../AttributeTable.module.css";

interface TableControlsProps {
    showFilters: boolean;
    hasActiveFilters: boolean;
    onToggleFilters: () => void;
    onClearFilters: () => void;
    dict: Record<string, string>;
}

export const TableControls = ({
    showFilters,
    hasActiveFilters,
    onToggleFilters,
    onClearFilters,
    dict,
}: TableControlsProps) => (
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
);
