import type { ReactNode } from "react";
import type { Dictionary } from "../../../types";
import type {
    DataTableLabels,
    GeometryColumnConfig,
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
                valueRenderers={valueRenderers}
                onOpenValue={onOpenValue}
                labels={labels}
                dict={dict}
            />
        );
    });
};
