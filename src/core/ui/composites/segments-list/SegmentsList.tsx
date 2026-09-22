import React from "react";
import { Text } from "@core/ui/components/primitives/text/Text";
import styles from "./MeasurementPanel.module.css";

export interface Segment {
    /** Left-side label (e.g. "Point 1 → 2"). Unique within the list — the React key. */
    label: string;
    /** Right-side formatted value (e.g. "12.3 m") */
    value: string;
    /** Optional sub-rows (e.g. horizontal / vertical breakdown) */
    details?: SegmentDetail[];
}

export interface SegmentDetail {
    /** Unique within the segment — the React key. */
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
 * Scrollable list of measurement segments with optional detail rows.
 * Used by ruler-3d and area-measure to display per-edge distances.
 */
export const SegmentsList: (props: SegmentsListProps) => React.ReactNode = ({
    title,
    segments,
}) => (
    <div className={styles.segments}>
        <Text variant="title" className={styles.segmentsTitle}>
            {title}
        </Text>
        <div className={styles.segmentsList}>
            {segments.map((segment) => (
                <div key={segment.label} className={styles.segmentItem}>
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
                    {segment.details && segment.details.length > 0 && (
                        <div className={styles.segmentComponents}>
                            {segment.details.map((detail) => (
                                <div
                                    key={detail.label}
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

export default SegmentsList;
