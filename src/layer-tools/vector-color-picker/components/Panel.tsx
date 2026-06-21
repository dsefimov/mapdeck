import React from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/framework/store";
import { isLayerNode, LayerRoles } from "@core/framework/types";
import type { TreeNode, VectorLayerConfig } from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";
import { ColorPicker } from "@core/ui/composites/color-picker/ColorPicker";
import { InputLabel, SliderInput } from "@core/ui/components/primitives/inputs";
import { VECTOR_COLOR_PICKER_ID } from "./Tool";
import styles from "./Panel.module.css";

export interface VectorColorPickerProps {
    nodeId: string;
}

interface GuardResult {
    paint: Record<string, unknown>;
    opacity: number;
}

function validateNode(
    node: TreeNode | null,
    nodeId: string,
): GuardResult | null {
    if (!node || !isLayerNode(node)) {
        logger.warn(`VectorColorPicker: node ${nodeId} is not a layer`);
        return null;
    }

    const displayRole = node.roles.display;
    if (!displayRole) return null;

    const config = displayRole.render.config as unknown as Record<
        string,
        unknown
    >;
    const role = config.role;
    if (role !== "vector" && role !== "geojson") {
        logger.warn(`VectorColorPicker: node ${nodeId} has unsupported config`);
        return null;
    }

    const paint = (config.paint as Record<string, unknown>) ?? {};
    const opacity = (paint["fill-opacity"] as number) ?? 1.0;

    return { paint, opacity };
}

export const VectorColorPickerComponent: (
    props: VectorColorPickerProps,
) => React.ReactNode = observer(({ nodeId }) => {
    const rootStore = useRootStore();
    const dict = rootStore.localeStore.t(VECTOR_COLOR_PICKER_ID);
    const node = rootStore.treeStore.getNode(nodeId);

    const guard = validateNode(node, nodeId);
    if (!guard) return null;
    const { paint, opacity } = guard;

    const updatePaint = (paintUpdates: Record<string, unknown>): void => {
        const merged = { ...paint, ...paintUpdates };
        rootStore.treeStore.updateLayerConfig<typeof LayerRoles.VECTOR>(
            nodeId,
            { paint: merged } as Partial<VectorLayerConfig>,
        );
    };

    const updateOpacity = (newOpacity: number): void => {
        rootStore.treeStore.updateLayerConfig<typeof LayerRoles.VECTOR>(
            nodeId,
            {
                paint: {
                    ...paint,
                    "fill-opacity": newOpacity,
                    "line-opacity": newOpacity,
                    "circle-opacity": newOpacity,
                },
            } as Partial<VectorLayerConfig>,
        );
    };

    const handleOpacityChange = (newOpacity: number): void => {
        updateOpacity(newOpacity);
    };

    return (
        <div className={styles.container}>
            <ColorPicker
                label={dict["label.color"] ?? "Color"}
                value={(paint["fill-color"] as string) ?? ""}
                onChange={(color) => updatePaint({ "fill-color": color })}
            />
            <ColorPicker
                label={dict["label.border-color"] ?? "Border color"}
                value={(paint["line-color"] as string) ?? ""}
                onChange={(color) => updatePaint({ "line-color": color })}
            />
            <div className={styles.opacitySection}>
                <InputLabel variant="caption" htmlFor="opacity">
                    {dict["label.opacity"] ?? "Opacity"}:{" "}
                    {Math.round(opacity * 100)}%
                </InputLabel>
                <SliderInput
                    id="opacity"
                    min={0}
                    max={1}
                    step={0.01}
                    value={opacity}
                    onChange={handleOpacityChange}
                />
            </div>
        </div>
    );
});
