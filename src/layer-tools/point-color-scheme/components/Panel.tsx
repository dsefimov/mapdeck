import React from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import { isLayerNode, ColorScheme } from "@core/contracts";
import { logger } from "@core/lib/logger";
import { typedDict } from "@core/lib/text";
import { Field, SelectInput } from "@core/ui/components";
import type { SelectOption } from "@core/ui/components/primitives/inputs";
import { setColorScheme } from "@core/domain/layer-tree";
import type { PointColorSchemeLocaleKey } from "../locale";
import { POINT_COLOR_SCHEME_SELECTOR_ID } from "./Tool";

export interface PointColorSchemeSelectorProps {
    nodeId: string;
}

export const PointColorSchemeComponent: (
    props: PointColorSchemeSelectorProps,
) => React.ReactNode = observer(({ nodeId }) => {
    const rootStore = useRootStore();
    const dict = typedDict<PointColorSchemeLocaleKey>(
        rootStore.localeStore.t(POINT_COLOR_SCHEME_SELECTOR_ID),
    );
    const node = rootStore.treeStore.node(nodeId);

    if (!node || !isLayerNode(node)) {
        logger.warn(`PointColorSchemeSelector: node ${nodeId} is not a layer`);
        return null;
    }

    const metadata = node.style?.metadata ?? {};
    // Unvalidated style metadata: only a string naming a real scheme is
    // trusted; anything else reads as the default.
    const currentScheme =
        typeof metadata.colorScheme === "string"
            ? metadata.colorScheme
            : ColorScheme.RGB;

    const handleSchemeChange = (value: string) => {
        rootStore.treeStore.updateLayerStyle(
            nodeId,
            setColorScheme(node.style ?? {}, value),
        );
    };

    const availableSchemes: SelectOption[] = [
        { value: ColorScheme.RGB, label: dict["scheme.rgb"] },
        {
            value: ColorScheme.CLASSIFICATION,
            label: dict["scheme.classification"],
        },
        { value: ColorScheme.ELEVATION, label: dict["scheme.elevation"] },
        { value: ColorScheme.INTENSITY, label: dict["scheme.intensity"] },
    ];

    return (
        <Field
            label={dict["label.colorBy"]}
            htmlFor="point-color-scheme"
        >
            <SelectInput
                id="point-color-scheme"
                value={currentScheme}
                options={availableSchemes}
                {...(dict["aria.colorScheme"] && {
                    ariaLabel: dict["aria.colorScheme"],
                })}
                onChange={handleSchemeChange}
            />
        </Field>
    );
});

export default PointColorSchemeComponent;
