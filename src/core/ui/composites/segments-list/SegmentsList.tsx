import type { ReactNode } from "react";
import { Text } from "../../components/primitives/text/Text";
import styles from "./SegmentsList.module.css";

export interface Segment {
    /** Left-side label */
    label: string;
    /** Right-side formatted value */
    value: string;
    /** Optional sub-rows rendered under the segment line */
    details?: SegmentDetail[];
}

export interface SegmentDetail {
    label: string;
    value: string;
}

export interface SegmentsListProps {
    /** Section title */
    title: string;
    /** Ordered list of segments */
    segments: Segment[];
}

/**
 * Scrollable list of label/value segments with optional detail rows.
 */
export const SegmentsList: (props: SegmentsListProps) => ReactNode = ({
    title,
    segments,
}) => (
    <div className={styles.segments}>
        <Text variant="title" className={styles.segmentsTitle}>
            {title}
        </Text>
        <div className={styles.segmentsList}>
            {segments.map((segment, index) => (
                <div key={index} className={styles.segmentItem}>
                    <div className={styles.segmentMain}>
                        <Text variant="body" tone="secondary">
                            {segment.label}
                        </Text>
                        <Text
                            variant="body"
                            tone="accent"
                            weight="semibold"
                        >
                            {segment.value}
                        </Text>
                    </div>
                    {segment.details && segment.details.length > 0 && (
                        <div className={styles.segmentComponents}>
                            {segment.details.map((detail, detailIndex) => (
                                <div
                                    key={detailIndex}
                                    className={styles.segmentComponent}
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

