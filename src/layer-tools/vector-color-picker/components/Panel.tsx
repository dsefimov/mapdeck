import React from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import { isLayerNode } from "@core/contracts";
import { logger } from "@core/lib/logger";
import { setUniformVectorOpacity } from "@core/domain/layer-tree";
import { ColorPicker } from "@core/ui/composites";
import { SliderInput } from "@core/ui/components/primitives/inputs";
import { Field } from "@core/ui/components";
import { DEFAULT_ACCENT_CSS } from "@core/ui/theme";
import { VECTOR_COLOR_PICKER_ID } from "./Tool";
import styles from "./Panel.module.css";
import type { LayerStyle } from "@core/contracts";

export interface VectorColorPickerProps {
    nodeId: string;
}

function labelOf(
    dict: Record<string, string>,
    key: string,
    fallback: string,
): string {
    return dict[key] ?? fallback;
}

function withPaint(
    style: LayerStyle,
    paintUpdates: Record<string, unknown>,
): LayerStyle {
    return { ...style, paint: { ...style.paint, ...paintUpdates } };
}

export const VectorColorPickerComponent: (
    props: VectorColorPickerProps,
) => React.ReactNode = observer(({ nodeId }) => {
    const rootStore = useRootStore();
    const dict = rootStore.localeStore.t(VECTOR_COLOR_PICKER_ID);
    const node = rootStore.treeStore.node(nodeId);

    if (!node || !isLayerNode(node)) {
        logger.warn(`VectorColorPicker: node ${nodeId} is not a layer`);
        return null;
    }

    const style = node.style ?? {};
    const paint = (style.paint ?? {}) as Record<string, unknown>;
    const opacity = (paint["fill-opacity"] as number) ?? 1.0;

    const handleOpacityChange = (newOpacity: number): void => {
        rootStore.treeStore.updateLayerStyle(
            nodeId,
            setUniformVectorOpacity(style, newOpacity),
        );
    };

    return (
        <div className={styles.container}>
            {/* Unset paint renders with the theme accent on the map —
                the swatch shows that same color until the user picks one */}
            <ColorPicker
                label={labelOf(dict, "label.color", "Color")}
                value={(paint["fill-color"] as string) ?? DEFAULT_ACCENT_CSS}
                onChange={(color) =>
                    rootStore.treeStore.updateLayerStyle(
                        nodeId,
                        withPaint(style, { "fill-color": color }),
                    )
                }
            />
            <ColorPicker
                label={labelOf(dict, "label.border-color", "Border color")}
                value={(paint["line-color"] as string) ?? DEFAULT_ACCENT_CSS}
                onChange={(color) =>
                    rootStore.treeStore.updateLayerStyle(
                        nodeId,
                        withPaint(style, { "line-color": color }),
                    )
                }
            />
            <Field
                htmlFor="opacity"
                label={
                    <>
                        {labelOf(dict, "label.opacity", "Opacity")}:{" "}
                        {Math.round(opacity * 100)}%
                    </>
                }
            >
                <SliderInput
                    id="opacity"
                    min={0}
                    max={1}
                    step={0.01}
                    value={opacity}
                    onChange={handleOpacityChange}
                />
            </Field>
        </div>
    );
});
