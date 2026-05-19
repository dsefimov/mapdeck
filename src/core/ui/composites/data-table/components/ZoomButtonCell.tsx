import React, { useCallback } from "react";
import { Icon } from "@core/ui/components";
import type { Bbox } from "@core/shared/geo";
import { Bbox as BboxClass } from "@core/shared/geo";
import type { TranslationDict } from "@core/framework/types";
import styles from "../AttributeTable.module.css";

interface ZoomButtonCellProps {
    bbox: unknown;
    isLoaded: boolean;
    onZoom: (bbox: Bbox) => void;
    dict: TranslationDict;
}

export const ZoomButtonCell: React.FC<ZoomButtonCellProps> = React.memo(
    ({ bbox, isLoaded, onZoom, dict }) => {
        const handleClick = useCallback(() => {
            if (bbox instanceof BboxClass) onZoom(bbox);
        }, [bbox, onZoom]);

        return (
            <td className={styles.zoomCell}>
                <button
                    type="button"
                    className={styles.zoomButton}
                    title={dict["attributeTable.zoomToObject"]}
                    aria-label={dict["attributeTable.zoomToObject"]}
                    disabled={!isLoaded || bbox == null}
                    onClick={handleClick}
                >
                    <Icon name="zoom" />
                </button>
            </td>
        );
    },
);
ZoomButtonCell.displayName = "ZoomButtonCell";
