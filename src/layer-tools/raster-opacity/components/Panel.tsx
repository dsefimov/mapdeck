import React from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/framework/store";
import { isLayerNode, isRasterConfig, LayerRoles } from "@core/framework/types";
import { formatDict } from "@core/framework/i18n";
import { logger } from "@core/shared/diagnostics/logger";
import { RASTER_OPACITY_SLIDER_ID } from "./Tool";
import styles from "./Panel.module.css";

export interface RasterOpacitySliderProps {
    nodeId: string;
}

export const RasterOpacityComponent: (
    props: RasterOpacitySliderProps,
) => React.ReactNode = observer(({ nodeId }) => {
    const rootStore = useRootStore();
    const dict = rootStore.localeStore.t(RASTER_OPACITY_SLIDER_ID);
    const node = rootStore.treeStore.getNode(nodeId);

    if (!node || !isLayerNode(node)) {
        logger.warn(`RasterOpacitySlider: node ${nodeId} is not a layer`);
        return null;
    }

    const displayRole = node.roles.display;
    if (!displayRole) return null;
    if (!isRasterConfig(displayRole.render.config)) {
        logger.warn(
            `RasterOpacitySlider: node ${nodeId} is not a raster layer`,
        );
        return null;
    }

    const currentOpacity = displayRole.render.config.opacity ?? 1.0;

    const handleOpacityChange = (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const newOpacity = parseFloat(event.target.value);
        if (!isNaN(newOpacity)) {
            rootStore.treeStore.updateLayerConfig<typeof LayerRoles.RASTER>(
                nodeId,
                {
                    opacity: newOpacity,
                },
            );
            logger.debug(
                `Changed opacity for layer ${nodeId} to ${newOpacity}`,
            );
        }
    };

    return (
        <div className={styles.opacitySliderContainer}>
            <label className={styles.opacityLabel}>
                {formatDict(dict["label.opacity"]!, {
                    percent: Math.round(currentOpacity * 100),
                })}
            </label>
            <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={currentOpacity}
                onChange={handleOpacityChange}
                className={styles.opacitySlider}
                aria-label={dict["aria.opacity"]}
            />
        </div>
    );
});

export default RasterOpacityComponent;
