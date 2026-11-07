import React from "react";
import { Text } from "@core/ui/components/primitives/text/Text";
import type { GeometryColumnConfig } from "../types";
import { formatValue } from "../utils";
import { ZoomButtonCell } from "./ZoomButtonCell";
import styles from "../AttributeTable.module.css";

interface ColumnarRowProps {
    row: Record<string, unknown>;
    globalIdx: number;
    showRowNumbers: boolean;
    columns: string[];
    geometryColumn?: GeometryColumnConfig | undefined;
    dict: Record<string, string>;
}

export const ColumnarRow = React.memo<ColumnarRowProps>(
    ({ row, globalIdx, showRowNumbers, columns, geometryColumn, dict }) => (
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
                    dict={dict}
                />
            )}
            {columns.map((col) => (
                <td key={col}>
                    <Text variant="body">{formatValue(row[col], dict)}</Text>
                </td>
            ))}
        </tr>
    ),
);
ColumnarRow.displayName = "ColumnarRow";
