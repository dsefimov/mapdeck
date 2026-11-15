import type { ReactNode } from "react";
import { Text } from "../../components/primitives/text/Text";
import styles from "./KeyedList.module.css";

export interface KeyedListRow {
    /** Left-side label */
    label: string;
    /** Right-side formatted value */
    value: string;
    /** Optional sub-rows rendered under the row line */
    details?: KeyedListDetail[];
}

export interface KeyedListDetail {
    label: string;
    value: string;
}

export interface KeyedListProps {
    /** Section title */
    title: string;
    /** Ordered list of rows */
    rows: KeyedListRow[];
    /** One action node per row, rendered after the value */
    actions?: ReadonlyArray<ReactNode>;
}

/**
 * Scrollable list of label/value rows with optional detail rows.
 */
export const KeyedList: (props: KeyedListProps) => ReactNode = ({
    title,
    rows,
    actions,
}) => (
    <div className={styles.list}>
        <Text variant="title" className={styles.listTitle}>
            {title}
        </Text>
        <div className={styles.rows}>
            {rows.map((row, index) => (
                <div key={index} className={styles.row}>
                    <div className={styles.rowMain}>
                        <Text variant="body" tone="secondary">
                            {row.label}
                        </Text>
                        <div className={styles.rowEnd}>
                            <Text
                                variant="body"
                                tone="accent"
                                weight="semibold"
                            >
                                {row.value}
                            </Text>
                            {actions?.[index] != null && (
                                <div className={styles.rowActions}>
                                    {actions[index]}
                                </div>
                            )}
                        </div>
                    </div>
                    {row.details && row.details.length > 0 && (
                        <div className={styles.rowDetails}>
                            {row.details.map((detail, detailIndex) => (
                                <div
                                    key={detailIndex}
                                    className={styles.rowDetail}
                                >
                                    <Text variant="hint">
                                        {detail.label}
                                    </Text>
                                    <Text variant="hint">
                                        {detail.value}
                                    </Text>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    </div>
);
