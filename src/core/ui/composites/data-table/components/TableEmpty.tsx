import type { ReactNode } from "react";
import { Text } from "../../../components/primitives/text/Text";
import { EmptyState } from "../../../components/feedback/empty-state/EmptyState";
import type { DataTableLabels } from "../types";
import styles from "../AttributeTable.module.css";

interface TableEmptyProps {
    readonly header?: string | undefined;
    readonly labels: DataTableLabels;
    readonly onRefresh: (() => void) | (() => Promise<void>) | undefined;
}

/** Empty-table placeholder with an optional retry action. */
export function TableEmpty({
    header,
    labels,
    onRefresh,
}: TableEmptyProps): ReactNode {
    return (
        <>
            {header && <Text variant="title">{header}</Text>}
            <div className={styles.tableContainer}>
                <EmptyState
                    message={labels["dataTable.noData"]}
                    {...(onRefresh &&
                        labels["dataTable.retry"] && {
                            action: {
                                label: labels["dataTable.retry"],
                                onClick: onRefresh,
                            },
                        })}
                />
            </div>
        </>
    );
}
