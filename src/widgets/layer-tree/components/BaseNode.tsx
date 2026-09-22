import React from "react";
import { observer } from "mobx-react-lite";
import { Icon, IconButton, Text, type IconName } from "@core/ui/components";
import type { TreeNode } from "@core/contracts";
import { isGroupNode, isLayerNode } from "@core/contracts";
import { typedDict } from "@core/lib/text";
import { useRootStore } from "@core/shell";
import { SwitchInput } from "@core/ui/components/primitives/inputs";
import type { LayerTreeLocaleKey } from "../locale";
import { LAYER_TREE_ID } from "..";
import styles from "./Widget.module.css";

interface ExpandButtonProps {
    readonly isExtended: boolean;
    readonly collapseLabel: string;
    readonly expandLabel: string;
    readonly onClick: () => void;
}

function ExpandButton({
    isExtended,
    collapseLabel,
    expandLabel,
    onClick,
}: ExpandButtonProps) {
    return (
        <IconButton
            icon={isExtended ? "not-collapsed" : "collapsed"}
            label={isExtended ? collapseLabel : expandLabel}
            onClick={onClick}
            className={styles.layerTree__nodeButton}
        />
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
    readonly onClick: () => void;
    readonly disabled?: boolean;
    /** Active state (menu open) — highlighted with the accent */
    readonly active?: boolean;
}

function ActionButton({
    iconName,
    label,
    onClick,
    disabled = false,
    active = false,
}: ActionButtonProps) {
    return (
        <IconButton
            icon={iconName}
            label={label}
            onClick={onClick}
            disabled={disabled}
            active={active}
            className={styles.layerTree__nodeButton}
        />
    );
}

const PROTOCOL_ICON: Record<string, IconName> = {
    wms: "raster",
    xyz: "raster",
    cog: "raster",
    copc: "point-cloud",
    "vector-tile": "vector",
    "geojson-tiled": "vector",
    wfs: "vector",
    "ogc-features": "vector",
};

interface NodeFlags {
    isGroup: boolean;
    hasZoom: boolean;
    showExpandButton: boolean;
    layerTypeIcon: IconName;
}

function getLayerTypeIconForNode(node: TreeNode): IconName {
    if (isLayerNode(node)) {
        return PROTOCOL_ICON[node.renderer.protocolId] ?? "layers";
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
        handleExpandClick: () => {
            if (flags.isGroup && callbacks.onToggleExpansion) {
                callbacks.onToggleExpansion(node.id);
            }
        },
        handleZoomClick: () => {
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
    const shouldShowExpandArrow = showExpandArrow ?? isGroup;

    return {
        isGroup,
        hasZoom: !!onZoom,
        showExpandButton:
            shouldShowExpandArrow && isGroup && !!onToggleExpansion,
        layerTypeIcon: getLayerTypeIconForNode(node),
    };
}

export interface BaseNodeProps {
    node: TreeNode;
    depth?: number;
    isExpanded?: boolean;
    onToggleExpansion?: ((nodeId: string) => void) | undefined;
    onToggleVisibility?:
        | ((nodeId: string, visible: boolean) => void)
        | undefined;
    onOpenMenu?: ((nodeId: string) => void) | undefined;
    onZoom?: ((nodeId: string) => void) | undefined;
    showExpandArrow?: boolean;
    moreButtonDisabled?: boolean;
    isMorePanelOpen?: boolean;
    /** Render-error message — shows an indicator on the row when present. */
    renderError?: string | undefined;
    /** Reason the node cannot render — mutes the row and disables its actions. */
    unsupported?: string | undefined;
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
    d: Record<LayerTreeLocaleKey, string>,
): NodeLabels {
    return {
        moreBtnIcon: flags.isGroup ? "report" : "settings-sliders",
        moreBtnLabel: flags.isGroup
            ? d["aria.reports"]
            : d["aria.moreOptions"],
        typeIconLabel:
            flags.layerTypeIcon === "report"
                ? d["aria.reportDocument"]
                : d["aria.layerType"],
        collapseLabel: d["aria.collapse"],
        expandLabel: d["aria.expand"],
        zoomToExtentLabel: d["aria.zoomToExtent"],
    };
}

interface NodeActionsProps {
    readonly flags: NodeFlags;
    readonly labels: NodeLabels;
    readonly renderError?: string | undefined;
    /** Unsupported rows keep their affordances visible but inert. */
    readonly controlsDisabled: boolean;
    readonly moreButtonDisabled: boolean;
    readonly isMorePanelOpen: boolean;
    readonly zoomDisabled: boolean;
    readonly onZoomClick: () => void;
    readonly onMoreClick: () => void;
}

/** Right-section controls: error badge, zoom, and the menu opener. */
function NodeActions({
    flags,
    labels,
    renderError,
    controlsDisabled,
    moreButtonDisabled,
    isMorePanelOpen,
    zoomDisabled,
    onZoomClick,
    onMoreClick,
}: NodeActionsProps) {
    return (
        <div className={styles.layerTree__rightSection}>
            {renderError && (
                <span
                    className={styles.layerTree__errorBadge}
                    title={renderError}
                >
                    !
                </span>
            )}

            {flags.hasZoom && (
                <ActionButton
                    iconName="zoom"
                    label={labels.zoomToExtentLabel}
                    onClick={onZoomClick}
                    disabled={zoomDisabled}
                />
            )}

            <ActionButton
                iconName={labels.moreBtnIcon}
                label={labels.moreBtnLabel}
                onClick={onMoreClick}
                disabled={moreButtonDisabled || controlsDisabled}
                active={isMorePanelOpen}
            />
        </div>
    );
}

function rowClassName(unsupported?: string | undefined): string {
    return [
        styles.layerTree__nodeContainer,
        unsupported && styles.layerTree__nodeUnsupported,
    ]
        .filter(Boolean)
        .join(" ");
}

const BaseNode: (props: BaseNodeProps) => React.ReactNode = observer(
    ({
        node,
        depth = 0,
        isExpanded = false,
        onToggleExpansion,
        onToggleVisibility,
        onOpenMenu,
        onZoom,
        showExpandArrow,
        moreButtonDisabled = false,
        isMorePanelOpen = false,
        renderError,
        unsupported,
    }) => {
        const rootStore = useRootStore();
        const d = typedDict<LayerTreeLocaleKey>(
            rootStore.localeStore.t(LAYER_TREE_ID),
        );
        const flags = getNodeFlags(
            node,
            onZoom,
            showExpandArrow,
            onToggleExpansion,
        );


        const handlers = createClickHandlers(node, flags, {
            onToggleExpansion,
            onZoom,
        });

        const handleMoreClick = () => {
            onOpenMenu?.(node.id);
        };

        const labels = getNodeLabels(flags, d);

        return (
            <div
                className={rowClassName(unsupported)}
                style={{ "--depth": depth } as React.CSSProperties}
                title={unsupported ?? node.description}
            >
                <div className={styles.layerTree__leftSection}>
                    {flags.showExpandButton && (
                        <ExpandButton
                            isExtended={isExpanded}
                            collapseLabel={labels.collapseLabel}
                            expandLabel={labels.expandLabel}
                            onClick={handlers.handleExpandClick}
                        />
                    )}

                    <SwitchInput
                        id={`visibility-${node.id}`}
                        checked={node.isVisible}
                        disabled={Boolean(unsupported)}
                        onChange={(checked) => {
                            onToggleVisibility?.(node.id, checked);
                        }}
                    />

                    <TypeIcon
                        iconName={flags.layerTypeIcon}
                        label={labels.typeIconLabel}
                    />

                    <Text
                        variant="body"
                        truncate
                        className={styles.layerTree__nodeTitle}
                    >
                        {node.title}
                    </Text>
                </div>

                <NodeActions
                    flags={flags}
                    labels={labels}
                    renderError={renderError}
                    controlsDisabled={Boolean(unsupported)}
                    moreButtonDisabled={moreButtonDisabled}
                    isMorePanelOpen={isMorePanelOpen}
                    zoomDisabled={
                        !rootStore.treeStore.getZoomExtent(node.id)
                    }
                    onZoomClick={handlers.handleZoomClick}
                    onMoreClick={handleMoreClick}
                />
            </div>
        );
    },
);

export default BaseNode;
