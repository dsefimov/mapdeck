import React from "react";
import { cn } from "@core/ui/utils/cn";
import { Text } from "@core/ui/components/primitives/text/Text";
import styles from "./SummarySection.module.css";

export interface SummaryItem {
    /** Unique within the list — the React key. */
    label: string;
    value: string;
    /** Colored dot left of the label (horizontal/vertical component) */
    dot?: "horizontal" | "vertical";
}

export interface SummarySectionProps {
    items: SummaryItem[];
    className?: string;
}

/**
 * Measurement summary card. Row: label on the left, value on the right
 * (accent).
 */
export const SummarySection: (props: SummarySectionProps) => React.ReactNode = ({
    items,
    className,
}) => {
    return (
        <div className={cn(styles.summary, className)}>
            {items.map((item) => (
                <div key={item.label} className={styles.item}>
                    <Text variant="body" weight="bold" className={styles.label}>
                        {item.dot && (
                            <span
                                className={cn(
                                    styles.dot,
                                    item.dot === "horizontal"
                                        ? styles.dotHorizontal
                                        : styles.dotVertical,
                                )}
                            />
                        )}
                        {item.label}
                    </Text>
                    <Text variant="body" weight="bold" tone="accent">
                        {item.value}
                    </Text>
                </div>
            ))}
        </div>
    );
};

export default SummarySection;
