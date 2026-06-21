import React from "react";
import { observer } from "mobx-react-lite";
import { Icon, type IconName } from "@core/ui/components";
import type { TreeNode, GroupNode } from "@core/framework/types";
import { isGroupNode, isLayerNode } from "@core/framework/types";
import { LayerRoles, type LayerRole } from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";
import { useRootStore } from "@core/framework/store";
import { SwitchInput } from "@core/ui/components/primitives/inputs";
import { LAYER_TREE_ID } from "..";
import styles from "./Widget.module.css";

interface ExpandButtonProps {
    readonly isExtended: boolean;
    readonly collapseLabel: string;
    readonly expandLabel: string;
    readonly onClick: (e: React.MouseEvent) => void;
}

function ExpandButton({
    isExtended,
    collapseLabel,
    expandLabel,
    onClick,
}: ExpandButtonProps) {
    return (
        <button
            className={styles.layerTree__expandButton}
            onClick={onClick}
            aria-label={isExtended ? collapseLabel : expandLabel}
            title={isExtended ? collapseLabel : expandLabel}
        >
            <Icon name={isExtended ? "not-collapsed" : "collapsed"} />
        </button>
    );
}

interface TypeIconProps {
    readonly iconName: IconName;
    readonly label: string;
}

function TypeIcon({ iconName, label }: TypeIconProps) {
    return (
        <div className={styles.layerTree__typeIcon}>
            <Icon name={iconName} title={label} />
        </div>
    );
}

interface ActionButtonProps {
    readonly iconName: IconName;
    readonly label: string;
    readonly onClick: (e: React.MouseEvent) => void;
    readonly disabled?: boolean;
}

function ActionButton({
    iconName,
    label,
    onClick,
    disabled = false,
}: ActionButtonProps) {
    return (
        <button
            className={styles.layerTree__actionButton}
            onClick={onClick}
            aria-label={label}
            title={label}
            disabled={disabled}
        >
            <Icon name={iconName} />
        </button>
    );
}

interface MoreButtonProps {
    readonly isActive: boolean;
    readonly disabled: boolean;
    readonly icon: IconName;
    readonly label: string;
    readonly onClick: (e: React.MouseEvent) => void;
}

function MoreButton({
    isActive,
    disabled,
    icon,
    label,
    onClick,
}: MoreButtonProps) {
    return (
        <button
            className={`${styles.layerTree__actionButton} ${
                isActive ? styles.layerTree__actionButtonActive : ""
            }`}
            onClick={onClick}
            aria-label={label}
            title={label}
            disabled={disabled}
        >
            <Icon name={icon} />
        </button>
    );
}

const LAYER_ROLE_ICON: Record<LayerRole, IconName> = {
    [LayerRoles.RASTER]: "raster",
    [LayerRoles.VECTOR]: "vector",
    [LayerRoles.POINT_CLOUD]: "point-cloud",
    [LayerRoles.GEOJSON]: "vector", // Reuse vector icon for GeoJSON
};

interface NodeFlags {
    isGroup: boolean;
    isLayer: boolean;
    isExtended: boolean;
    nodeVisibility: boolean;
    hasEyeIcon: boolean;
    hasZoom: boolean;
    hasMore: boolean;
    hasReports: boolean;
    showExpandButton: boolean;
    layerTypeIcon: IconName;
}

function getLayerTypeIconForNode(node: TreeNode): IconName {
    if (isLayerNode(node)) {
        const displayRole = node.roles.display;
        if (!displayRole) return "layers";
        if (displayRole.render.config) {
            return (
                LAYER_ROLE_ICON[displayRole.render.config.role as LayerRole] ??
                "raster"
            );
        }
        return "raster";
    }
    return "layers";
}

function createClickHandlers(
    node: TreeNode,
    flags: NodeFlags,
    callbacks: {
        onToggleExpansion?: BaseNodeProps["onToggleExpansion"];
        onZoom?: BaseNodeProps["onZoom"];
    },
) {
    return {
        handleExpandClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            if (flags.isGroup && callbacks.onToggleExpansion) {
                callbacks.onToggleExpansion(node.id);
            }
        },
        handleZoomClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            if (flags.hasZoom && callbacks.onZoom) {
                callbacks.onZoom(node.id);
            }
        },
    };
}

function getNodeFlags(
    node: TreeNode,
    onZoom?: BaseNodeProps["onZoom"],
    showExpandArrow?: boolean,
    onToggleExpansion?: BaseNodeProps["onToggleExpansion"],
): NodeFlags {
    const isGroup = isGroupNode(node);
    const isLayer = isLayerNode(node);
    const nodeVisibility = isGroup || isLayer ? node.isVisible : false;
    const hasEyeIcon = isGroup || isLayer;
    const hasReports = node.roles.reports.length > 0;
    const shouldShowExpandArrow = showExpandArrow ?? isGroup;

    return {
        isGroup,
        isLayer,
        isExtended: isGroup ? (node as GroupNode).isExtended : false,
        nodeVisibility,
        hasEyeIcon,
        hasZoom: (isGroup || isLayer) && !!onZoom,
        hasMore: true,
        hasReports,
        showExpandButton:
            shouldShowExpandArrow && isGroup && !!onToggleExpansion,
        layerTypeIcon: getLayerTypeIconForNode(node),
    };
}

export interface BaseNodeProps {
    /** The tree node to render */
    node: TreeNode;
    /** Depth level for indentation (0 = root) */
    depth?: number;
    /** Callback when expansion state changes (groups only) */
    onToggleExpansion?: ((nodeId: string) => void) | undefined;
    /** Callback when visibility changes (groups and layers only) */
    onToggleVisibility?:
        | ((nodeId: string, visible: boolean) => void)
        | undefined;
    /** Callback for zoom action (groups and layers only) */
    onZoom?: ((nodeId: string) => void) | undefined;
    /** Whether to show expand/collapse arrow (defaults to true for groups) */
    showExpandArrow?: boolean;
    /** Whether the more button should be disabled (e.g., no tools available) */
    moreButtonDisabled?: boolean;
    /** Whether the more options panel is currently open for this node */
    isMorePanelOpen?: boolean;
}

interface NodeLabels {
    readonly moreBtnIcon: IconName;
    readonly moreBtnLabel: string;
    readonly typeIconLabel: string;
    readonly collapseLabel: string;
    readonly expandLabel: string;
    readonly zoomToExtentLabel: string;
}

function getNodeLabels(
    flags: NodeFlags,
    d: Record<string, string | undefined>,
): NodeLabels {
    return {
        moreBtnIcon: flags.isGroup ? "report" : "settings-sliders",
        moreBtnLabel: flags.isGroup
            ? d["aria.reports"]!
            : d["aria.moreOptions"]!,
        typeIconLabel:
            flags.layerTypeIcon === "report"
                ? d["aria.reportDocument"]!
                : d["aria.layerType"]!,
        collapseLabel: d["aria.collapse"]!,
        expandLabel: d["aria.expand"]!,
        zoomToExtentLabel: d["aria.zoomToExtent"]!,
    };
}

const BaseNode: (props: BaseNodeProps) => React.ReactNode = observer(
    ({
        node,
        depth = 0,
        onToggleExpansion,
        onToggleVisibility,
        onZoom,
        showExpandArrow,
        moreButtonDisabled = false,
        isMorePanelOpen = false,
    }) => {
        const rootStore = useRootStore();
        const d = rootStore.localeStore.t(LAYER_TREE_ID);
        const flags = getNodeFlags(
            node,
            onZoom,
            showExpandArrow,
            onToggleExpansion,
        );

        // Placeholder nodes (no display role) get no action buttons
        const isPlaceholder = isLayerNode(node) && !node.roles.display;
        if (isPlaceholder) {
            flags.hasEyeIcon = false;
            flags.hasZoom = false;
            flags.hasMore = false;
        }

        const handlers = createClickHandlers(node, flags, {
            onToggleExpansion,
            onZoom,
        });

        const handleMoreClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            rootStore.treeStore.togglePanel(node.id);
        };

        const labels = getNodeLabels(flags, d);

        return (
            <div
                className={styles.layerTree__nodeContainer}
                style={{ "--depth": depth } as React.CSSProperties}
                title={node.description}
            >
                <div className={styles.layerTree__leftSection}>
                    {flags.showExpandButton && (
                        <ExpandButton
                            isExtended={flags.isExtended}
                            collapseLabel={labels.collapseLabel}
                            expandLabel={labels.expandLabel}
                            onClick={handlers.handleExpandClick}
                        />
                    )}

                    {flags.hasEyeIcon && (
                        <SwitchInput
                            id={`visibility-${node.id}`}
                            checked={flags.nodeVisibility}
                            onChange={(checked) => {
                                logger.debug(
                                    `Calling onToggleVisibility(${node.id}, ${checked})`,
                                );
                                onToggleVisibility?.(node.id, checked);
                            }}
                        />
                    )}

                    <TypeIcon
                        iconName={flags.layerTypeIcon}
                        label={labels.typeIconLabel}
                    />

                    <span className={styles.layerTree__nodeTitle}>
                        {node.title}
                    </span>
                </div>

                <div className={styles.layerTree__rightSection}>
                    {flags.hasZoom && (
                        <ActionButton
                            iconName="zoom"
                            label={labels.zoomToExtentLabel}
                            onClick={handlers.handleZoomClick}
                            disabled={!node.bbox}
                        />
                    )}

                    {flags.hasMore && (
                        <MoreButton
                            isActive={isMorePanelOpen}
                            disabled={moreButtonDisabled}
                            icon={labels.moreBtnIcon}
                            label={labels.moreBtnLabel}
                            onClick={handleMoreClick}
                        />
                    )}
                </div>
            </div>
        );
    },
);

export default BaseNode;
