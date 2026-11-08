import React, { useCallback } from "react";
import { IconButton } from "../../../components/primitives/icon-button/IconButton";
import type { Bbox } from "@core/lib/geo";
import { Bbox as BboxClass } from "@core/lib/geo";
import type { DataTableLabels } from "../types";
import styles from "../AttributeTable.module.css";

interface ZoomButtonCellProps {
    bbox: unknown;
    onZoom: (bbox: Bbox) => void;
    labels: DataTableLabels;
}

export const ZoomButtonCell = React.memo<ZoomButtonCellProps>(
    ({ bbox, onZoom, labels }) => {
        const handleClick = useCallback(() => {
            if (bbox instanceof BboxClass) onZoom(bbox);
        }, [bbox, onZoom]);

        return (
            <td className={styles.zoomCell}>
                <IconButton
                    icon="zoom"
                    label={labels["dataTable.zoomToObject"]}
                    disabled={bbox == null}
                    onClick={handleClick}
                />
            </td>
        );
    },
);
ZoomButtonCell.displayName = "ZoomButtonCell";
