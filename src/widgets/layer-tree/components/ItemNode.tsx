import React from "react";
import { observer } from "mobx-react-lite";
import BaseNode, { type BaseNodeProps } from "./BaseNode";
import { CollapsibleMenu } from "@core/ui/components";
import { ReportDownloads } from "./ReportDownloads";

import type { TreeNode } from "@core/framework/types";
import { isLayerNode } from "@core/framework/types";
import { LayerRoles, type LayerRole } from "@core/framework/types";
import { useRootStore } from "@core/framework/store";
import { logger } from "@core/shared/diagnostics/logger";
import styles from "./Widget.module.css";

export interface ItemNodeProps {
    /** The layer node to render */
    node: TreeNode;
    /** Depth level for indentation (0 = root) */
    depth?: number | undefined;
    /** Callback when visibility changes */
    onVisibilityChange: (nodeId: string, visible: boolean) => void;
    /** Callback for zoom action */
    onZoom?: ((nodeId: string) => void) | undefined;
}

const ItemNode: (props: ItemNodeProps) => React.ReactNode = observer(
    ({ node, depth = 0, onVisibilityChange, onZoom }) => {
        const rootStore = useRootStore();
        const treeStore = rootStore.treeStore;

        // Ensure this is actually a layer node
        if (!isLayerNode(node)) {
            logger.warn(
                `ItemNode component received non-layer node: ${node.id}`,
            );
            return null;
        }

        // Get the active display role to determine tools
        const displayRole = node.roles.display;
        const roleForTools =
            displayRole?.render.config.role ?? LayerRoles.RASTER;

        // Check if this node has any tools available
        const hasTools = displayRole
            ? rootStore.layerToolStore.getLayerTools(roleForTools).length > 0
            : false;

        // Check if this node has any report roles
        const hasReports = node.roles.reports.length > 0;

        // Check if this node's "More" panel is open
        const isPanelOpen = treeStore.isNodePanelOpen(node.id);

        // Layers don't have expand/collapse or open actions
        const baseNodeProps: BaseNodeProps = {
            node,
            depth,
            onToggleVisibility: onVisibilityChange,
            onZoom,
            // Layers don't expand
            onToggleExpansion: undefined,
            // Layers don't show expand arrow
            showExpandArrow: false,
            // Disable button if no tools and no reports available
            moreButtonDisabled: !hasTools && !hasReports,
            // Highlight button when panel is open
            isMorePanelOpen: isPanelOpen,
        };

        return (
            <>
                <BaseNode {...baseNodeProps} />
                {isPanelOpen && (
                    <ItemMenu
                        node={node}
                        roleForTools={roleForTools}
                        hasReports={hasReports}
                    />
                )}
            </>
        );
    },
);

/**
 * Separate component to keep ItemNode complexity low.
 */
const ItemMenu: (props: {
    node: import("@core/framework/types").LayerNode;
    roleForTools: LayerRole;
    hasReports: boolean;
}) => React.ReactNode = observer(({ node, roleForTools, hasReports }) => {
    const rootStore = useRootStore();
    const treeStore = rootStore.treeStore;

    return (
        <CollapsibleMenu
            items={rootStore.layerToolStore.getLayerTools(roleForTools)}
            open={true}
            onClose={() => treeStore.togglePanel(node.id)}
            className={styles.layerTree__menuContainer}
            panelClassName={styles.layerTree__menuPanel}
            closeOnClickOutside={false}
            hideIfEmpty={!hasReports}
            nodeId={node.id}
        >
            {hasReports && <ReportDownloads nodeId={node.id} />}
        </CollapsibleMenu>
    );
});

export default ItemNode;
