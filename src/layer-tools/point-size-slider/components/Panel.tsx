import React, { useRef, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/framework/store";
import {
    isLayerNode,
    isPointCloudConfig,
    LayerRoles,
} from "@core/framework/types";
import type { PointCloudLayerConfig } from "@core/framework/types";
import { useDebounce } from "@core/framework/hooks";
import { formatDict } from "@core/framework/i18n";
import { logger } from "@core/shared/diagnostics/logger";
import { POINT_SIZE_SLIDER_ID } from "./Tool";
import styles from "./Panel.module.css";

export interface PointSizeSliderProps {
    nodeId: string;
}

const DEBOUNCE_DELAY_MS = 150;
const POINT_SIZE_MIN = 0.1;
const POINT_SIZE_MAX = 2;
const POINT_SIZE_STEP = 0.1;

export const PointSizeSliderComponent: (
    props: PointSizeSliderProps,
) => React.ReactNode = observer(({ nodeId }) => {
    const rootStore = useRootStore();
    const dict = rootStore.localeStore.t(POINT_SIZE_SLIDER_ID);
    const node = rootStore.treeStore.getNode(nodeId);

    const pendingRef = useRef<number | null>(null);

    if (!node || !isLayerNode(node)) {
        logger.warn(`PointSizeSlider: node ${nodeId} is not a layer`);
        return null;
    }

    const displayRole = node.roles.display;
    if (!displayRole) return null;
    if (!isPointCloudConfig(displayRole.render.config)) {
        logger.warn(
            `PointSizeSlider: config for node ${nodeId} is not a point cloud config`,
        );
        return null;
    }

    const config = displayRole.render.config as PointCloudLayerConfig;

    const applyPointSizeUpdate = useCallback(
        (newPointSize: number) => {
            rootStore.treeStore.updateLayerConfig<
                typeof LayerRoles.POINT_CLOUD
            >(nodeId, { pointSize: newPointSize });
            pendingRef.current = null;

            logger.debug(
                `Changed point size for layer ${nodeId} to ${newPointSize}`,
            );
        },
        [nodeId, rootStore.treeStore],
    );

    const debounced = useDebounce(applyPointSizeUpdate, DEBOUNCE_DELAY_MS);

    const handlePointSizeChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const newPointSize = parseFloat(event.target.value);

            if (isNaN(newPointSize)) {
                return;
            }

            pendingRef.current = newPointSize;
            debounced.call(newPointSize);
        },
        [debounced],
    );

    const handlePointerUp = useCallback(() => {
        debounced.flush();
    }, [debounced]);

    const displayPointSize = debounced.isPending
        ? (pendingRef.current ?? config.pointSize ?? 2)
        : (config.pointSize ?? 2);

    return (
        <div className={styles.pointSizeSliderContainer}>
            <label className={styles.pointSizeLabel}>
                {formatDict(dict["label.pointSize"]!, {
                    value: displayPointSize.toFixed(1),
                })}
                {debounced.isPending && (
                    <span className={styles.debouncingIndicator}>...</span>
                )}
            </label>
            <input
                type="range"
                min={POINT_SIZE_MIN}
                max={POINT_SIZE_MAX}
                step={POINT_SIZE_STEP}
                value={displayPointSize}
                onChange={handlePointSizeChange}
                onPointerUp={handlePointerUp}
                onMouseUp={handlePointerUp}
                onTouchEnd={handlePointerUp}
                className={styles.pointSizeSlider}
                aria-label={dict["aria.pointSize"]}
            />
        </div>
    );
});

export default PointSizeSliderComponent;
