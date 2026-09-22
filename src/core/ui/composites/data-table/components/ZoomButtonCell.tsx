import React, { useCallback } from "react";
import { IconButton } from "@core/ui/components/primitives/icon-button/IconButton";
import { typedDict } from "@core/lib/text";
import type { Bbox } from "@core/lib/geo";
import { Bbox as BboxClass } from "@core/lib/geo";
import styles from "../AttributeTable.module.css";

interface ZoomButtonCellProps {
    bbox: unknown;
    isLoaded: boolean;
    onZoom: (bbox: Bbox) => void;
    dict: Record<string, string>;
}

export const ZoomButtonCell = React.memo<ZoomButtonCellProps>(
    ({ bbox, isLoaded, onZoom, dict }) => {
        const handleClick = useCallback(() => {
            if (bbox instanceof BboxClass) onZoom(bbox);
        }, [bbox, onZoom]);

        // The kit cannot name the core dictionary's key union (`ui → lib`
        // layer rule), so it types exactly the keys it consumes.
        const labels = typedDict<"dataTable.zoomToObject">(dict);

        return (
            <td className={styles.zoomCell}>
                <IconButton
                    icon="zoom"
                    label={labels["dataTable.zoomToObject"]}
                    disabled={!isLoaded || bbox == null}
                    onClick={handleClick}
                />
            </td>
        );
    },
);
ZoomButtonCell.displayName = "ZoomButtonCell";
