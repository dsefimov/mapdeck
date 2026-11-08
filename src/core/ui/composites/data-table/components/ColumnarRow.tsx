import { memo } from "react";
import { Text } from "../../../components/primitives/text/Text";
import type { DataTableLabels, GeometryColumnConfig } from "../types";
import { formatValue } from "../utils";
import { ZoomButtonCell } from "./ZoomButtonCell";
import styles from "../AttributeTable.module.css";

interface ColumnarRowProps {
    row: Record<string, unknown>;
    globalIdx: number;
    showRowNumbers: boolean;
    columns: string[];
    geometryColumn?: GeometryColumnConfig | undefined;
    labels: DataTableLabels;
}

export const ColumnarRow = memo<ColumnarRowProps>(
    ({ row, globalIdx, showRowNumbers, columns, geometryColumn, labels }) => (
        <tr>
            {showRowNumbers && (
                <td className={styles.rowNumber}>
                    <Text variant="hint" tone="muted">
                        {globalIdx + 1}
                    </Text>
                </td>
            )}
            {geometryColumn && (
                <ZoomButtonCell
                    bbox={row[geometryColumn.key]}
                    onZoom={geometryColumn.onZoom}
                    labels={labels}
                />
            )}
            {columns.map((col) => (
                <td key={col}>
                    <Text variant="body">{formatValue(row[col], labels)}</Text>
                </td>
            ))}
        </tr>
    ),
);
ColumnarRow.displayName = "ColumnarRow";
