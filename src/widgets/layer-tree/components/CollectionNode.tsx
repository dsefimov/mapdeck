import React from "react";
import { observer } from "mobx-react-lite";
import type { TreeNode } from "@core/contracts";
import { isGroupNode } from "@core/contracts";
import { CollapsibleMenu } from "@core/ui/components";

import BaseNode, { type BaseNodeProps } from "./BaseNode";
import { ReportDownloads } from "./ReportDownloads";
import { LoadingScreen } from "@core/ui/components";
import { useRootStore } from "@core/shell";
import { logger } from "@core/lib/logger";
import styles from "./Widget.module.css";

/* Spinner threshold — show loading indicator when children count
   is unknown (0) or exceeds this value. */
const SPINNER_CHILDREN_THRESHOLD = 20;

function shouldShowSpinner(
    expanded: boolean,
    isLoading: boolean,
    childrenCount: number,
): boolean {
    return (
        expanded &&
        isLoading &&
        (childrenCount === 0 || childrenCount > SPINNER_CHILDREN_THRESHOLD)
    );
}

export interface CollectionNodeProps {
    node: TreeNode;
    depth?: number | undefined;
    isExpanded: boolean;
    isMenuOpen: boolean;
    onToggleExpansion: (nodeId: string) => void;
    onToggleVisibility: (nodeId: string, visible: boolean) => void;
    onOpenMenu: (nodeId: string) => void;
    onCloseMenu: () => void;
    onZoom?: ((nodeId: string) => void) | undefined;
}

/**
 * Renders a single group row. Children are separate rows produced by the
 * view model's `visibleRows` — this component does not recurse.
 */
const CollectionNode: (props: CollectionNodeProps) => React.ReactNode =
    observer(
        ({
            node,
            depth = 0,
            isExpanded,
            isMenuOpen,
            onToggleExpansion,
            onToggleVisibility,
            onOpenMenu,
            onCloseMenu,
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

            const collectionReports = node.relatedObjects.filter(
                (o) => o.type === "report",
            );
            const hasReports = collectionReports.length > 0;

            const baseNodeProps: BaseNodeProps = {
                node,
                depth,
                isExpanded,
                onToggleExpansion,
                onToggleVisibility,
                onOpenMenu,
                onZoom,
                showExpandArrow: true,
                moreButtonDisabled: !hasReports,
                isMorePanelOpen: isMenuOpen,
            };

            const showSpinner = shouldShowSpinner(
                isExpanded,
                treeStore.isLoading(node.id),
                node.childrenCount,
            );

            return (
                <>
                    <BaseNode {...baseNodeProps} />

                    {isMenuOpen && hasReports && (
                        <CollapsibleMenu
                            open={true}
                            onClose={onCloseMenu}
                            className={styles.layerTree__menuContainer}
                            closeOnClickOutside={false}
                            hideIfEmpty={false}
                            nodeId={node.id}
                        >
                            <ReportDownloads nodeId={node.id} />
                        </CollapsibleMenu>
                    )}

                    {showSpinner && <LoadingScreen />}
                </>
            );
        },
    );

export default CollectionNode;
