import { memo } from "react";
import type { ReactNode } from "react";
import { Text } from "../../../components/primitives/text/Text";
import type { Dictionary } from "../../../types";
import type {
    DataTableLabels,
    GeometryColumnConfig,
    ValueRenderer,
} from "../types";
import { formatValue, resolveValueRenderer } from "../utils";
import { ZoomButtonCell } from "./ZoomButtonCell";
import styles from "../AttributeTable.module.css";

interface ColumnarRowProps {
    row: Record<string, unknown>;
    globalIdx: number;
    showRowNumbers: boolean;
    columns: string[];
    geometryColumn?: GeometryColumnConfig | undefined;
    valueRenderers?: readonly ValueRenderer[] | undefined;
    onOpenValue?:
        | ((rendererId: string, value: unknown) => void)
        | undefined;
    labels: DataTableLabels;
    dict: Dictionary;
}

interface ValueCellProps {
    value: unknown;
    labels: DataTableLabels;
    dict: Dictionary;
    valueRenderers?: readonly ValueRenderer[] | undefined;
    onOpenValue?:
        | ((rendererId: string, value: unknown) => void)
        | undefined;
}

const ValueCell: (props: ValueCellProps) => ReactNode = ({
    value,
    labels,
    dict,
    valueRenderers,
    onOpenValue,
}) => {
    const renderer = resolveValueRenderer(value, valueRenderers);
    if (renderer) {
        return (
            <>
                {renderer.renderCell(value, {
                    open: () => onOpenValue?.(renderer.id, value),
                    dict,
                })}
            </>
        );
    }
    return <Text variant="body">{formatValue(value, labels)}</Text>;
};

export const ColumnarRow = memo<ColumnarRowProps>(
    ({
        row,
        globalIdx,
        showRowNumbers,
        columns,
        geometryColumn,
        valueRenderers,
        onOpenValue,
        labels,
        dict,
    }) => (
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
                    <ValueCell
                        value={row[col]}
                        labels={labels}
                        dict={dict}
                        valueRenderers={valueRenderers}
                        onOpenValue={onOpenValue}
                    />
                </td>
            ))}
        </tr>
    ),
);
ColumnarRow.displayName = "ColumnarRow";
