import React from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import { isLayerNode } from "@core/contracts";
import { formatDict, typedDict } from "@core/lib/text";
import { logger } from "@core/lib/logger";
import { SliderInput } from "@core/ui/components/primitives/inputs";
import { Field } from "@core/ui/components";
import { setRasterOpacity } from "@core/domain/layer-tree";
import type { RasterOpacityLocaleKey } from "../locale";
import { RASTER_OPACITY_SLIDER_ID } from "./Tool";

export interface RasterOpacitySliderProps {
    nodeId: string;
}

export const RasterOpacityComponent: (
    props: RasterOpacitySliderProps,
) => React.ReactNode = observer(({ nodeId }) => {
    const rootStore = useRootStore();
    const dict = typedDict<RasterOpacityLocaleKey>(
        rootStore.localeStore.t(RASTER_OPACITY_SLIDER_ID),
    );
    const node = rootStore.treeStore.node(nodeId);

    if (!node || !isLayerNode(node)) {
        logger.warn(`RasterOpacitySlider: node ${nodeId} is not a layer`);
        return null;
    }

    const paint = node.style?.paint ?? {};
    const currentOpacity = (paint["raster-opacity"] as number) ?? 1.0;

    const handleOpacityChange = (newOpacity: number) => {
        rootStore.treeStore.updateLayerStyle(
            nodeId,
            setRasterOpacity(node.style ?? {}, newOpacity),
        );
    };

    return (
        <Field
            label={formatDict(dict["label.opacity"], {
                percent: Math.round(currentOpacity * 100),
            })}
            htmlFor="opacity"
        >
            <SliderInput
                id="opacity"
                min={0}
                max={1}
                step={0.01}
                value={currentOpacity}
                onChange={handleOpacityChange}
            />
        </Field>
    );
});

export default RasterOpacityComponent;
