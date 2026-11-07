import type { GeometryColumnConfig } from "../types";
import { ColumnarRow } from "./ColumnarRow";

interface VisibleRowsProps {
    sortedData: Record<string, unknown>[];
    startIndex: number;
    endIndex: number;
    displayColumns: string[];
    showRowNumbers: boolean;
    geometryColumn: GeometryColumnConfig | undefined;
    dict: Record<string, string>;
}

export const VisibleRows = ({
    sortedData,
    startIndex,
    endIndex,
    displayColumns,
    showRowNumbers,
    geometryColumn,
    dict,
}: VisibleRowsProps) => {
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
                dict={dict}
            />
        );
    });
};
