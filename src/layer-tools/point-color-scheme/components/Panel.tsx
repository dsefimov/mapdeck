import React from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/framework/store";
import {
    isLayerNode,
    isPointCloudConfig,
    ColorScheme,
    LayerRoles,
} from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";
import { POINT_COLOR_SCHEME_SELECTOR_ID } from "./Tool";
import styles from "./Panel.module.css";

export interface PointColorSchemeSelectorProps {
    nodeId: string;
}

export const PointColorSchemeComponent: (
    props: PointColorSchemeSelectorProps,
) => React.ReactNode = observer(({ nodeId }) => {
    const rootStore = useRootStore();
    const dict = rootStore.localeStore.t(POINT_COLOR_SCHEME_SELECTOR_ID);
    const node = rootStore.treeStore.getNode(nodeId);

    if (!node || !isLayerNode(node)) {
        logger.warn(`PointColorSchemeSelector: node ${nodeId} is not a layer`);
        return null;
    }

    const displayRole = node.roles.display;
    if (!displayRole) return null;
    if (!isPointCloudConfig(displayRole.render.config)) {
        logger.warn(
            `PointColorSchemeSelector: config for node ${nodeId} is not a point cloud config`,
        );
        return null;
    }

    const currentScheme =
        displayRole.render.config.colorScheme ?? ColorScheme.RGB;

    const handleSchemeChange = (
        event: React.ChangeEvent<HTMLSelectElement>,
    ) => {
        const newScheme = event.target.value as ColorScheme;
        rootStore.treeStore.updateLayerConfig<typeof LayerRoles.POINT_CLOUD>(
            nodeId,
            {
                colorScheme: newScheme,
            },
        );
        logger.debug(
            `Changed color scheme for layer ${nodeId} to ${newScheme}`,
        );
    };

    // Define available color schemes with labels
    const availableSchemes = [
        {
            value: ColorScheme.RGB,
            label: dict["scheme.rgb"]!,
        },
        {
            value: ColorScheme.CLASSIFICATION,
            label: dict["scheme.classification"]!,
        },
        {
            value: ColorScheme.ELEVATION,
            label: dict["scheme.elevation"]!,
        },
        {
            value: ColorScheme.INTENSITY,
            label: dict["scheme.intensity"]!,
        },
    ];

    return (
        <div className={styles.pointColorSchemeContainer}>
            <label className={styles.pointColorSchemeLabel}>
                {dict["label.colorBy"]}
            </label>
            <select
                value={currentScheme}
                onChange={handleSchemeChange}
                className={styles.pointColorSchemeSelect}
                aria-label={dict["aria.colorScheme"]}
            >
                {availableSchemes.map((scheme) => (
                    <option key={scheme.value} value={scheme.value}>
                        {scheme.label}
                    </option>
                ))}
            </select>
        </div>
    );
});

export default PointColorSchemeComponent;
