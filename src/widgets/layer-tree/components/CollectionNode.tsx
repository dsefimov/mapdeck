import React from "react";
import { observer } from "mobx-react-lite";
import type { TreeNode } from "@core/framework/types";
import { isGroupNode, isLayerNode } from "@core/framework/types";
import { CollapsibleMenu } from "@core/ui/components";

import BaseNode, { type BaseNodeProps } from "./BaseNode";
import ItemNode from "./ItemNode";
import { ReportDownloads } from "./ReportDownloads";
import { useRootStore } from "@core/framework/store";
import { logger } from "@core/shared/diagnostics/logger";
import styles from "./Widget.module.css";

export interface CollectionNodeProps {
    /** The group node to render */
    node: TreeNode;
    /** Depth level for indentation (0 = root) */
    depth?: number | undefined;
    /** Callback when expansion state changes */
    onToggleExpansion: (nodeId: string) => void;
    /** Callback when group visibility changes */
    onToggleVisibility: (nodeId: string, visible: boolean) => void;
    /** Callback when layer visibility changes */
    onToggleItemVisible:
        | ((nodeId: string, visible: boolean) => void)
        | undefined;
    /** Callback for zoom action (groups and layers only) */
    onZoom?: ((nodeId: string) => void) | undefined;
}

const CollectionNode: (props: CollectionNodeProps) => React.ReactNode =
    observer(
        ({
            node,
            depth = 0,
            onToggleExpansion,
            onToggleVisibility,
            onToggleItemVisible,
            onZoom,
        }) => {
            const rootStore = useRootStore();
            const treeStore = rootStore.treeStore;
            if (!isGroupNode(node)) {
                // Should never happen because parent filters, but guard.
                logger.warn(
                    `CollectionNode received non-group node: ${node.id}`,
                );
                return null;
            }

            const expanded = node.isExtended;

            // Get child nodes from store
            const childNodes = treeStore.getChildNodes(node.id);

            const renderChild = (child: TreeNode) => {
                const childDepth = depth + 1;

                if (isGroupNode(child)) {
                    return (
                        <CollectionNode
                            key={child.id}
                            node={child}
                            depth={childDepth}
                            onToggleExpansion={onToggleExpansion}
                            onToggleVisibility={onToggleVisibility}
                            onToggleItemVisible={onToggleItemVisible}
                            onZoom={onZoom}
                        />
                    );
                } else if (isLayerNode(child)) {
                    return (
                        <ItemNode
                            key={child.id}
                            node={child}
                            depth={childDepth}
                            onVisibilityChange={
                                onToggleItemVisible ?? onToggleVisibility
                            }
                            onZoom={onZoom}
                        />
                    );
                }
                return null;
            };

            // Check if this node's "More" panel is open
            const isPanelOpen = treeStore.isNodePanelOpen(node.id);

            // Check if this group has any report roles
            const hasReports = node.roles.reports.length > 0;

            // BaseNode props for the collection header
            const baseNodeProps: BaseNodeProps = {
                node,
                depth,
                onToggleExpansion,
                onToggleVisibility,
                onZoom,
                showExpandArrow: true,
                // Enable button only if there are reports
                moreButtonDisabled: !hasReports,
                // Highlight button when panel is open
                isMorePanelOpen: isPanelOpen,
            };

            return (
                <>
                    <BaseNode {...baseNodeProps} />

                    {isPanelOpen && hasReports && (
                        <CollapsibleMenu
                            open={true}
                            onClose={() => treeStore.togglePanel(node.id)}
                            className={styles.layerTree__menuContainer}
                            panelClassName={styles.layerTree__menuPanel}
                            closeOnClickOutside={false}
                            hideIfEmpty={false}
                            nodeId={node.id}
                        >
                            <ReportDownloads nodeId={node.id} />
                        </CollapsibleMenu>
                    )}

                    {expanded && childNodes.length > 0 && (
                        <div>{childNodes.map(renderChild)}</div>
                    )}
                </>
            );
        },
    );

export default CollectionNode;
