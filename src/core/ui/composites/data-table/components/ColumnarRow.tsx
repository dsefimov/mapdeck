import { memo, useId } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Text } from "../../../components/primitives/text/Text";
import { CheckboxInput } from "../../../components/primitives/inputs/CheckboxInput";
import type { Dictionary } from "../../../types";
import type {
    DataTableLabels,
    GeometryColumnConfig,
    SelectionColumnConfig,
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
    selection?: SelectionColumnConfig | undefined;
    /** The row's selection key, when selection is wired. */
    rowId?: string | undefined;
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

/**
 * Interactive descendants handle their own clicks — the zoom button,
 * value cells with openers, the selection checkbox.
 */
const INTERACTIVE_SELECTOR = "button, input, a, label, [role='button']";

export const ColumnarRow = memo<ColumnarRowProps>(
    ({
        row,
        globalIdx,
        showRowNumbers,
        columns,
        geometryColumn,
        selection,
        rowId,
        valueRenderers,
        onOpenValue,
        labels,
        dict,
    }) => {
        const checkboxId = useId();
        const selected =
            selection && rowId !== undefined
                ? selection.isSelected(rowId)
                : false;

        const handleRowClick =
            selection && rowId !== undefined
                ? (event: MouseEvent<HTMLTableRowElement>) => {
                      if (
                          (event.target as HTMLElement).closest(
                              INTERACTIVE_SELECTOR,
                          )
                      )
                          return;
                      selection.onToggleRow(row);
                  }
                : undefined;

        return (
            <tr
                className={selected ? styles.rowSelected : undefined}
                onClick={handleRowClick}
            >
                {showRowNumbers && (
                    <td className={styles.rowNumber}>
                        <Text variant="hint" tone="muted">
                            {globalIdx + 1}
                        </Text>
                    </td>
                )}
                {selection && rowId !== undefined && (
                    <td className={styles.selectionCell}>
                        <CheckboxInput
                            id={`${checkboxId}-select`}
                            checked={selected}
                            ariaLabel={labels["dataTable.selectRow"]}
                            onChange={() => selection.onToggleRow(row)}
                        />
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
        );
    },
);
ColumnarRow.displayName = "ColumnarRow";
