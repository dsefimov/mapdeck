import React from "react";
import type { TranslationDict } from "@core/framework/types";
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
    dict: TranslationDict;
}

const CellValue: React.FC<{
    isLoaded: boolean;
    loading: boolean;
    value: unknown;
    dict: TranslationDict;
}> = React.memo(({ isLoaded, loading, value, dict }) => {
    if (isLoaded) return <>{formatValue(value, dict)}</>;
    if (loading) return <>…</>;
    return null;
});
CellValue.displayName = "CellValue";

export const ColumnarRow: React.FC<ColumnarRowProps> = React.memo(
    ({ row, globalIdx, isLoaded, columns, loading, geometryColumn, dict }) => (
        <tr style={!isLoaded ? { opacity: 0.3 } : undefined}>
            <td className={styles.rowNumber}>{globalIdx + 1}</td>
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
