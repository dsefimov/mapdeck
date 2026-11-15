import React from "react";
import { observer } from "mobx-react-lite";
import { type LayerTreeProps } from "../types";
import { isGroupNode, isLayerNode, type TreeNode } from "@core/contracts";
import { resolveRenderer } from "@core/domain/layer-tree";
import { EmptyState, InlineError } from "@core/ui/components";
import styles from "./Widget.module.css";
import LayerTreeHeader from "./Header";
import CollectionNode from "./CollectionNode";
import ItemNode from "./ItemNode";
import { useRootStore } from "@core/shell";
import { LayerTreeViewModel } from "../viewModel/LayerTreeViewModel";
import { LAYER_TREE_ID } from "../index";

const LayerTreeBody: () => React.ReactNode = observer(() => {
    const rootStore = useRootStore();
    const dict = rootStore.localeStore.t(LAYER_TREE_ID);
    const treeStore = rootStore.treeStore;
    const viewModel = rootStore.stateStore.get(
        LAYER_TREE_ID,
        () => new LayerTreeViewModel(rootStore),
    );
    const rows = viewModel.visibleRows;
    const rootCount = treeStore.rootNodes.length;

    const toggleCollectionVisible = async (
        nodeId: string,
        visible: boolean,
    ) => {
        await treeStore.setCollectionVisible(nodeId, visible);
    };

    const toggleItemVisible = (nodeId: string, visible: boolean) => {
        treeStore.setItemVisible(nodeId, visible);
    };

    const handleZoom = (nodeId: string) => {
        const extent = treeStore.getZoomExtent(nodeId);
        if (extent) rootStore.mapStore.zoomToExtent(extent);
    };

    /** The shared snapshot predicate, phrased for the row UI. */
    const resolveUnsupported = (node: TreeNode): string | undefined => {
        if (!isLayerNode(node)) return undefined;
        const resolution = resolveRenderer(
            node,
            rootStore.protocolRegistry,
        );
        return resolution.renderable
            ? undefined
            : dict[`unsupported.${resolution.reason}`];
    };

    if (treeStore.isLoading() && rootCount === 0) {
        return <EmptyState message={dict["loading"]} />;
    }

    if (treeStore.error) {
        return (
            <InlineError
                message={`${dict["error.prefix"]} ${treeStore.error}`}
                onRetry={() => treeStore.refresh()}
                dict={rootStore.localeStore.t("core")}
            />
        );
    }

    if (
        viewModel.searchQuery !== "" &&
        rows.length === 0 &&
        !treeStore.isLoading()
    ) {
        return <EmptyState message={dict["empty.noMatch"]} />;
    }

    if (rootCount === 0) {
        return <EmptyState message={dict["empty.noLayers"]} />;
    }

    return (
        <div className={styles.layerTree__treeContainer}>
            {rows.map(({ nodeId, depth }) => {
                const node = treeStore.node(nodeId);
                if (!node) return null;

                const isMenuOpen = viewModel.openMenuId === nodeId;

                if (isGroupNode(node)) {
                    return (
                        <CollectionNode
                            key={nodeId}
                            node={node}
                            depth={depth}
                            isExpanded={viewModel.expandedIds.has(nodeId)}
                            isMenuOpen={isMenuOpen}
                            onToggleExpansion={viewModel.toggleExpanded}
                            onToggleVisibility={toggleCollectionVisible}
                            onOpenMenu={viewModel.openMenu}
                            onCloseMenu={viewModel.closeMenu}
                            onZoom={handleZoom}
                        />
                    );
                }
                if (isLayerNode(node)) {
                    return (
                        <ItemNode
                            key={nodeId}
                            node={node}
                            depth={depth}
                            isMenuOpen={isMenuOpen}
                            unsupported={resolveUnsupported(node)}
                            onVisibilityChange={toggleItemVisible}
                            onOpenMenu={viewModel.openMenu}
                            onCloseMenu={viewModel.closeMenu}
                            onZoom={handleZoom}
                        />
                    );
                }
                return null;
            })}
        </div>
    );
});

const LayerTreeComponent: (props: LayerTreeProps) => React.ReactNode = observer(
    ({ className = "" }) => {
        const rootStore = useRootStore();
        const treeStore = rootStore.treeStore;
        const viewModel = rootStore.stateStore.get(
            LAYER_TREE_ID,
            () => new LayerTreeViewModel(rootStore),
        );
        return (
            <div className={`layer-tree ${styles.layerTree} ${className}`}>
                <LayerTreeHeader
                    onUpdateClick={() => viewModel.refreshTree()}
                    disabled={treeStore.isLoading()}
                />
                <LayerTreeBody />
            </div>
        );
    },
);

export default LayerTreeComponent;
