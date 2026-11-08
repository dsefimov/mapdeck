import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Text } from "../../components/primitives/text/Text";
import styles from "./SummarySection.module.css";

export interface SummaryItem {
    label: string;
    value: string;
    /** Colored marker left of the label */
    marker?: "muted" | "accent";
}

export interface SummarySectionProps {
    items: SummaryItem[];
    className?: string | undefined;
}

/**
 * Summary card. Row: label on the left, value on the right (accent).
 */
export const SummarySection: (props: SummarySectionProps) => ReactNode = ({
    items,
    className,
}) => {
    return (
        <div className={cn(styles.summary, className)}>
            {items.map((item, index) => (
                <div key={index} className={styles.item}>
                    <Text variant="body" weight="bold" className={styles.label}>
                        {item.marker && (
                            <span
                                className={cn(
                                    styles.marker,
                                    item.marker === "muted"
                                        ? styles.markerMuted
                                        : styles.markerAccent,
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

