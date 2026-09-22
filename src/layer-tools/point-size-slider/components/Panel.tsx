import React from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import { isLayerNode } from "@core/contracts";
import { formatDict, typedDict } from "@core/lib/text";
import { logger } from "@core/lib/logger";
import { SliderInput } from "@core/ui/components/primitives/inputs";
import { Field } from "@core/ui/components";
import { POINT_SIZE_SLIDER_ID } from "./Tool";
import type { PointSizeSliderLocaleKey } from "../locale";
import { PointSizeViewModel } from "../viewModel/PointSizeViewModel";
import styles from "./Panel.module.css";

export interface PointSizeSliderProps {
    nodeId: string;
}

const POINT_SIZE_MIN = 0.1;
const POINT_SIZE_MAX = 2;
const POINT_SIZE_STEP = 0.1;

export const PointSizeSliderComponent: (
    props: PointSizeSliderProps,
) => React.ReactNode = observer(({ nodeId }) => {
    const rootStore = useRootStore();
    const dict = typedDict<PointSizeSliderLocaleKey>(
        rootStore.localeStore.t(POINT_SIZE_SLIDER_ID),
    );
    const node = rootStore.treeStore.node(nodeId);

    if (!node || !isLayerNode(node)) {
        logger.warn(`PointSizeSlider: node ${nodeId} is not a layer`);
        return null;
    }

    const paint = (node.style?.paint ?? {}) as Record<string, unknown>;
    const displayPointSize = (paint["circle-radius"] as number) ?? 2;

    // The debounced style write lives in the view model (ADR-0002 case-2);
    // cached per node, safe across panel remounts.
    const viewModel = rootStore.stateStore.get(
        `point-size:${nodeId}`,
        () => new PointSizeViewModel(rootStore, nodeId),
    );

    return (
        <Field
            htmlFor="pointSize"
            label={
                <>
                    {formatDict(dict["label.pointSize"], {
                        value: displayPointSize.toFixed(1),
                    })}
                    {viewModel.isPending && (
                        <span className={styles.debouncingIndicator}>
                            ...
                        </span>
                    )}
                </>
            }
        >
            <SliderInput
                id="pointSize"
                min={POINT_SIZE_MIN}
                max={POINT_SIZE_MAX}
                step={POINT_SIZE_STEP}
                value={displayPointSize}
                onChange={(size) => viewModel.update(size)}
                onCommit={viewModel.commit}
            />
        </Field>
    );
});
