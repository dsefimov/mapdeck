import React from "react";
import { Text } from "@core/ui/components/primitives/text/Text";
import type { GeometryColumnConfig } from "../types";
import { formatValue } from "../utils";
import { ZoomButtonCell } from "./ZoomButtonCell";
import styles from "../AttributeTable.module.css";

interface ColumnarRowProps {
    row: Record<string, unknown>;
    globalIdx: number;
    isLoaded: boolean;
    columns: string[];
    loading: boolean;
    geometryColumn?: GeometryColumnConfig | undefined;
    dict: Record<string, string>;
}

interface CellValueProps {
    isLoaded: boolean;
    loading: boolean;
    value: unknown;
    dict: Record<string, string>;
}

const CellValue = React.memo<CellValueProps>(({ isLoaded, loading, value, dict }) => {
    if (isLoaded) {
        return <Text variant="body">{formatValue(value, dict)}</Text>;
    }
    if (loading) return <Text variant="body">…</Text>;
    return null;
});
CellValue.displayName = "CellValue";

export const ColumnarRow = React.memo<ColumnarRowProps>(
    ({ row, globalIdx, isLoaded, columns, loading, geometryColumn, dict }) => (
        <tr style={!isLoaded ? { opacity: 0.3 } : undefined}>
            <td className={styles.rowNumber}>
                <Text variant="hint" tone="muted">
                    {globalIdx + 1}
                </Text>
            </td>
            {geometryColumn && (
                <ZoomButtonCell
                    bbox={row[geometryColumn.key]}
                    isLoaded={isLoaded}
                    onZoom={geometryColumn.onZoom}
                    dict={dict}
                />
            )}
            {columns.map((col) => (
                <td key={col}>
                    <CellValue
                        isLoaded={isLoaded}
                        loading={loading}
                        value={row[col]}
                        dict={dict}
                    />
                </td>
            ))}
        </tr>
    ),
);
ColumnarRow.displayName = "ColumnarRow";
