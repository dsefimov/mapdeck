import type { ReactNode } from "react";
import type { Dictionary } from "../../../types";
import type {
    DataTableLabels,
    GeometryColumnConfig,
    SelectionColumnConfig,
    ValueRenderer,
} from "../types";
import { ColumnarRow } from "./ColumnarRow";

interface VisibleRowsProps {
    sortedData: Record<string, unknown>[];
    startIndex: number;
    endIndex: number;
    displayColumns: string[];
    showRowNumbers: boolean;
    geometryColumn: GeometryColumnConfig | undefined;
    selection: SelectionColumnConfig | undefined;
    /** Source-index row keys, attached to the row objects (DataTable-built). */
    rowIds: WeakMap<object, string> | null;
    valueRenderers: readonly ValueRenderer[] | undefined;
    onOpenValue: ((rendererId: string, value: unknown) => void) | undefined;
    labels: DataTableLabels;
    dict: Dictionary;
}

export const VisibleRows: (props: VisibleRowsProps) => ReactNode[] = ({
    sortedData,
    startIndex,
    endIndex,
    displayColumns,
    showRowNumbers,
    geometryColumn,
    selection,
    rowIds,
    valueRenderers,
    onOpenValue,
    labels,
    dict,
}) => {
    const sliced = sortedData.slice(startIndex, endIndex);
    return sliced.map((row, index) => {
        const globalIdx = startIndex + index;
        return (
            <ColumnarRow
                key={`row-${globalIdx}`}
                row={row}
                globalIdx={globalIdx}
                showRowNumbers={showRowNumbers}
                columns={displayColumns}
                geometryColumn={geometryColumn}
                selection={selection}
                rowId={rowIds?.get(row)}
                valueRenderers={valueRenderers}
                onOpenValue={onOpenValue}
                labels={labels}
                dict={dict}
            />
        );
    });
};
