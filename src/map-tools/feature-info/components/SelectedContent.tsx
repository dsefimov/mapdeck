import React from "react";
import type { TranslationDict, FeatureGroup } from "@core/contracts";
import { EmptyState } from "@core/ui/components/feedback/empty-state/EmptyState";
import { DataTable } from "@core/ui/composites";

export interface SelectedContentProps {
    readonly group: FeatureGroup;
    readonly totalGroups: number;
    readonly dict: TranslationDict;
    readonly unsupportedMessage: string;
}

/**
 * Renders the selected group: the attribute table, or a localized message
 * when the layer's protocol cannot provide feature info.
 */
export function SelectedContent(props: SelectedContentProps): React.ReactNode {
    const { group, totalGroups, dict, unsupportedMessage } = props;
    if (group.features[0]?.unsupported) {
        return <EmptyState message={unsupportedMessage} />;
    }
    return (
        <DataTable
            rows={group.features.map((f) => f.attributes)}
            {...(totalGroups > 1 && { header: group.layerName })}
            dict={dict}
        />
    );
}
