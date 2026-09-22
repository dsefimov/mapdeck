import React from "react";
import { observer } from "mobx-react-lite";
import BaseNode, { type BaseNodeProps } from "./BaseNode";
import { CollapsibleMenu } from "@core/ui/components";
import { ReportDownloads } from "./ReportDownloads";

import type { TreeNode, LayerNode } from "@core/contracts";
import type { LayerTool } from "@core/contracts";
import { isLayerNode } from "@core/contracts";
import { useRootStore } from "@core/shell";
import { logger } from "@core/lib/logger";
import styles from "./Widget.module.css";

export interface ItemNodeProps {
    node: TreeNode;
    depth?: number | undefined;
    isMenuOpen: boolean;
    /** Reason the node cannot render, when the snapshot predicate blocks it. */
    unsupported?: string | undefined;
    onVisibilityChange: (nodeId: string, visible: boolean) => void;
    onOpenMenu: (nodeId: string) => void;
    onCloseMenu: () => void;
    onZoom?: ((nodeId: string) => void) | undefined;
}

const ItemNode: (props: ItemNodeProps) => React.ReactNode = observer(
    ({
        node,
        depth = 0,
        isMenuOpen,
        unsupported,
        onVisibilityChange,
        onOpenMenu,
        onCloseMenu,
        onZoom,
    }) => {
        const rootStore = useRootStore();

        if (!isLayerNode(node)) {
            logger.warn(
                `ItemNode component received non-layer node: ${node.id}`,
            );
            return null;
        }

        const tools = rootStore.layerToolStore.getToolsForNode(node);
        const hasTools = tools.length > 0;

        const hasReports = node.relatedObjects.some((o) => o.type === "report");
        const renderError = rootStore.treeStore.getRenderError(node.id);

        const baseNodeProps: BaseNodeProps = {
            node,
            depth,
            renderError,
            unsupported,
            onToggleVisibility: onVisibilityChange,
            onOpenMenu,
            onZoom,
            onToggleExpansion: undefined,
            showExpandArrow: false,
            moreButtonDisabled: !hasTools && !hasReports,
            isMorePanelOpen: isMenuOpen,
        };

        return (
            <>
                <BaseNode {...baseNodeProps} />
                {isMenuOpen && (
                    <ItemMenu
                        node={node}
                        tools={tools}
                        hasReports={hasReports}
                        onClose={onCloseMenu}
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
    node: LayerNode;
    tools: LayerTool[];
    hasReports: boolean;
    onClose: () => void;
}) => React.ReactNode = observer(({ node, tools, hasReports, onClose }) => {
    return (
        <CollapsibleMenu
            items={tools}
            open={true}
            onClose={onClose}
            className={styles.layerTree__menuContainer}
            closeOnClickOutside={false}
            hideIfEmpty={!hasReports}
            nodeId={node.id}
        >
            {hasReports && <ReportDownloads nodeId={node.id} />}
        </CollapsibleMenu>
    );
});

export default ItemNode;
