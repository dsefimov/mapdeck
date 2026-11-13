import React from "react";
import { observer } from "mobx-react-lite";
import type { TranslationDict, FeatureGroup } from "@core/contracts";
import { EmptyState } from "@core/ui/components/feedback/empty-state/EmptyState";
import { DataTable } from "@core/ui/composites";
import { useRootStore } from "@core/shell";

export interface SelectedContentProps {
    readonly group: FeatureGroup;
    readonly totalGroups: number;
    readonly dict: TranslationDict;
    readonly unsupportedMessage: string;
}

/**
 * Renders the selected group: the attribute table, or a localized message
 * when the layer's protocol cannot provide feature info. Attribute values
 * render through the registered value renderers; opening a value shows the
 * workspace-level viewer.
 */
export const SelectedContent: (
    props: SelectedContentProps,
) => React.ReactNode = observer(
    ({ group, totalGroups, dict, unsupportedMessage }) => {
        const { attributeValueStore } = useRootStore();

        if (group.features[0]?.unsupported) {
            return <EmptyState message={unsupportedMessage} />;
        }
        return (
            <DataTable
                rows={group.features.map((f) => f.attributes)}
                {...(totalGroups > 1 && { header: group.layerName })}
                valueRenderers={attributeValueStore.renderersList}
                onOpenValue={attributeValueStore.openView}
                dict={dict}
            />
        );
    },
);
