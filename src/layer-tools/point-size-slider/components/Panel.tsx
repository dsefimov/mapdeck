import React, { useState, useEffect, useRef, useCallback } from "react";
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

export const PointSizeSliderComponent: (
    props: PointSizeSliderProps,
) => React.ReactNode = observer(({ nodeId }) => {
    const rootStore = useRootStore();
    const dict = rootStore.localeStore.t(POINT_SIZE_SLIDER_ID);
    const node = rootStore.treeStore.getNode(nodeId);

    // Local state for immediate UI feedback
    const [localPointSize, setLocalPointSize] = useState<number>(2);
    const lastAppliedValueRef = useRef<number>(2);

    if (!node || !isLayerNode(node)) {
        logger.warn(`PointSizeSlider: node ${nodeId} is not a layer`);
        return null;
    }

    const displayRole = node.roles.display;
    if (!isPointCloudConfig(displayRole.render.config)) {
        logger.warn(
            `PointSizeSlider: config for node ${nodeId} is not a point cloud config`,
        );
        return null;
    }

    const config = displayRole.render.config as PointCloudLayerConfig;

    const applyPointSizeUpdate = useCallback(
        (newPointSize: number) => {
            if (lastAppliedValueRef.current === newPointSize) {
                return;
            }

            rootStore.treeStore.updateLayerConfig<
                typeof LayerRoles.POINT_CLOUD
            >(nodeId, { pointSize: newPointSize });
            lastAppliedValueRef.current = newPointSize;

            logger.debug(
                `Changed point size for layer ${nodeId} to ${newPointSize}`,
            );
        },
        [nodeId, rootStore.treeStore],
    );

    const debounced = useDebounce(applyPointSizeUpdate, DEBOUNCE_DELAY_MS);

    // Initialize local state from node config when component mounts or node changes
    useEffect(() => {
        const currentPointSize = config.pointSize ?? 2;
        setLocalPointSize(currentPointSize);
        lastAppliedValueRef.current = currentPointSize;
    }, [nodeId, config.pointSize]);

    const handlePointSizeChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const newPointSize = parseFloat(event.target.value);

            if (isNaN(newPointSize)) {
                return;
            }

            // Update local state immediately for UI feedback
            setLocalPointSize(newPointSize);
            debounced.call(newPointSize);
        },
        [debounced],
    );

    const handlePointerUp = useCallback(() => {
        // If user releases the slider, apply immediately
        debounced.flush();
    }, [debounced]);

    // Get the actual point size from config for display (fallback to local during debounce)
    const displayPointSize = debounced.isPending
        ? localPointSize
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
                min="0.1"
                max="2"
                step="0.1"
                value={localPointSize}
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
