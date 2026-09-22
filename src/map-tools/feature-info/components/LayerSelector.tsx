import React from "react";
import type { FeatureGroup } from "@core/contracts";
import { Field, SelectInput } from "@core/ui/components";
import type { SelectOption } from "@core/ui/components/primitives/inputs";

/** feature-info namespace keys the layer dropdown reads. */
export type LayerSelectorDict = {
    readonly "layer.label": string;
    readonly "select.placeholder": string;
};

export interface LayerSelectorProps {
    readonly groups: FeatureGroup[];
    readonly selectedIndex: number;
    readonly totalGroups: number;
    readonly dict: LayerSelectorDict;
    readonly onSelect: (index: number) => void;
}

/** Layer dropdown of the feature-info panel. */
export function LayerSelector(props: LayerSelectorProps): React.ReactNode {
    const { groups, selectedIndex, totalGroups, dict, onSelect } = props;

    const options: SelectOption[] = groups.map((group, index) => ({
        value: String(index),
        label: `${group.layerName} ${index + 1}/${totalGroups}`,
    }));

    return (
        <Field
            label={dict["layer.label"]}
            htmlFor="feature-info-layer-select"
        >
            <SelectInput
                id="feature-info-layer-select"
                value={String(selectedIndex)}
                options={options}
                disabled={groups.length === 0}
                {...(dict["select.placeholder"] && {
                    placeholder: dict["select.placeholder"],
                })}
                onChange={(value) => onSelect(Number(value))}
            />
        </Field>
    );
}
