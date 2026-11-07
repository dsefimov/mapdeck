import type { ReactNode } from "react";
import { Text } from "@core/ui/components/primitives/text/Text";
import { EmptyState } from "@core/ui/components/feedback/empty-state/EmptyState";
import styles from "../AttributeTable.module.css";

interface TableEmptyProps {
    readonly header?: string | undefined;
    readonly dict: Record<string, string>;
    readonly onRefresh: (() => void) | (() => Promise<void>) | undefined;
}

/** Empty-table placeholder with an optional retry action. */
export function TableEmpty({ header, dict, onRefresh }: TableEmptyProps): ReactNode {
    return (
        <>
            {header && <Text variant="title">{header}</Text>}
            <div className={styles.tableContainer}>
                <EmptyState
                    message={dict["dataTable.noData"]}
                    {...(onRefresh &&
                        dict["dataTable.retry"] && {
                            action: {
                                label: dict["dataTable.retry"],
                                onClick: onRefresh,
                            },
                        })}
                />
            </div>
        </>
    );
}
