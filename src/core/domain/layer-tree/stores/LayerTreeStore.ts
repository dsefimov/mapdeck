import {
    createCancellableReaction,
    KeyedAsyncState,
} from "@core/common/state";
// Direct logic imports, not the domain barrel: the barrel re-exports this
// store, so importing it here is a cycle that only works while every
// operation stays a hoisted function declaration.
import { collectLayerNodes } from "../logic/traversal/collectLayerNodes";
import { collectVisibleBboxes } from "../logic/traversal/collectVisibleBboxes";
import { toSnapshotItems } from "../logic/operations/toSnapshotItems";
import { reconcileTree } from "../logic/operations/reconcileTree";
import { resolveNodes } from "../logic/traversal/resolveNodes";
import { mergeUserState } from "../logic/operations/mergeUserState";
import { cascadeVisibility } from "../logic/operations/cascadeVisibility";
import type { OperationResult, TreeState } from "../types";
import type { StoreRegistry } from "@core/store-registry";
import {
    isGroupNode,
    isLayerNode,
    type GroupNode,
    type LayerNode,
    type LayerStyle,
    type SnapshotItem,
    type SourceAdapter,
    type SourceAdapterFactory,
    type ProtocolRegistry,
    type TreeNode,
} from "@core/contracts";
import { unionBbox, type Bbox } from "@core/lib/geo";
import { logger } from "@core/lib/logger";
import {
    comparer,
    computed,
    makeAutoObservable,
    observable,
    runInAction,
    type IObservableArray,
    type IReactionDisposer,
} from "mobx";

const DATA_SOURCE_URL_SETTING = "layer-tree.data-source-url";

export class LayerTreeStore {
    private static readonly TREE_ROOT = "";

    private _async = new KeyedAsyncState<string>();
    private _adapter: SourceAdapter | undefined;
    /** Source type of the active adapter — re-applied when the URL changes. */
    private _sourceType: string | undefined;
    /** Reload supersession counters per target key — a stale fetch must not apply. */
    private _reloadGenerations = new Map<string, number>();
    private _disposeSync: IReactionDisposer | undefined;

    /** Id of the operation whose failure the banner shows (last failed run). */
    private _lastFailedKey: string | null = null;
    /** Non-operation error (e.g. "data source URL cleared"), preferred by `error`. */
    private _stateError: string | null = null;
    /** Render errors per node id, set by the layer manager on lifecycle failure. */
    private _renderErrors = observable.map<string, string>();

    private _nodes = observable.map<string, TreeNode>();
    private _rootIds: IObservableArray<string> = observable.array<string>([]);
    /**
     * Groups whose child batch has arrived — empty or not. The lazy-load
     * guard: without it, an empty group (zero children, `childrenCount` 0)
     * would be re-fetched on every expand.
     */
    private _loadedGroups = observable.set<string>();

    /** In-flight visibility cascades, keyed by node id — re-toggle cancels. */
    private _visibilityControllers = new Map<string, AbortController>();

    private _treeState!: TreeState;

    /**
     * Cross-domain ports, consumer-owned: the minimal protocols
     * surfaces this store consumes, wired from the registry at construction.
     */
    private readonly protocols: ProtocolRegistry;
    private readonly sources: SourceAdapterFactory;

    private _layerSnapshot = computed<SnapshotItem[]>(
        () =>
            toSnapshotItems(
                collectLayerNodes(this._treeState),
                this.protocols,
            ),
        { equals: comparer.structural },
    );

    /**
     * Banner error: the last failed operation's message, or a state-level
     * error (e.g. "data source URL cleared") when one is set.
     */
    get error(): string | null {
        if (this._stateError !== null) return this._stateError;
        if (this._lastFailedKey !== null) {
            return this._async.get(this._lastFailedKey).error;
        }
        return null;
    }

    /**
     * Sets or clears per-node render errors reported by the layer manager.
     * An error message marks every node id; `null` clears them.
     */
    reportRenderError(nodeIds: string[], error: string | null): void {
        for (const nodeId of nodeIds) {
            if (error === null) {
                this._renderErrors.delete(nodeId);
            } else {
                this._renderErrors.set(nodeId, error);
            }
        }
    }

    /** Render error message for a node id, or `undefined` when it renders fine. */
    getRenderError(nodeId: string): string | undefined {
        return this._renderErrors.get(nodeId);
    }

    isLoading(id?: string): boolean {
        return this._async.isLoading(id);
    }

    async refresh(id?: string, signal?: AbortSignal): Promise<void> {
        if (!this._adapter) return;

        // A fresh load supersedes any state-level error.
        this._stateError = null;

        const parentId = id ?? null;

        if (parentId !== null) {
            const node = this._treeState.getNode(parentId);
            if (!node || !isGroupNode(node)) return;
            await this._reloadSubtree(parentId, signal);
        } else {
            await this._reloadRoot(signal);
        }
    }

    /**
     * Single lazy-loading path: loads a group's children when they have not
     * arrived yet. A group whose batch arrived — empty or not — is skipped;
     * manual `refresh` bypasses the marker. No-op for layer nodes and unknown
     * ids.
     */
    ensureChildrenLoaded(nodeId: string, signal?: AbortSignal): Promise<void> {
        const node = this._treeState.getNode(nodeId);
        if (!node || !isGroupNode(node)) return Promise.resolve();
        if (this._loadedGroups.has(nodeId)) return Promise.resolve();
        return this.refresh(nodeId, signal);
    }

    /**
     * Synchronously sets the visibility of a layer node.
     */
    setItemVisible(nodeId: string, visible: boolean): void {
        const node = this._treeState.getNode(nodeId);
        if (!node || !isLayerNode(node)) {
            logger.error(`Layer ${nodeId} not found`);
            return;
        }
        node.isVisible = visible;
    }

    /** Single style mutation path for layer-tool panels — they compute, this commits. */
    updateLayerStyle(nodeId: string, next: LayerStyle): void {
        const node = this._treeState.getNode(nodeId);
        if (!node || !isLayerNode(node)) {
            logger.error(`Layer ${nodeId} not found`);
            return;
        }
        node.style = next;
    }

    /**
     * Sets the visibility of a group node and cascades it to all reachable
     * descendants. Showing loads unloaded children first through
     * `ensureChildrenLoaded`; hiding touches only loaded descendants.
     * Re-toggling the same node cancels the in-flight cascade.
     */
    async setCollectionVisible(
        nodeId: string,
        visible: boolean,
    ): Promise<void> {
        const node = this._treeState.getNode(nodeId);
        if (!node || !isGroupNode(node)) {
            logger.error(`Group ${nodeId} not found`);
            return;
        }

        this._visibilityControllers.get(nodeId)?.abort();
        const controller = new AbortController();
        this._visibilityControllers.set(nodeId, controller);

        runInAction(() => {
            node.isVisible = visible;
        });

        // Cascade failures stay per-key (cascade:<nodeId>) and must not drive
        // the tree-level error banner — a visibility toggle is a per-node
        // operation, not a whole-tree one.
        try {
            await this._async.run(
                `cascade:${nodeId}`,
                async () => {
                    const ids = await cascadeVisibility(
                        this._treeState,
                        [nodeId],
                        visible,
                        {
                            loadChildren: (id, sig) =>
                                this.ensureChildrenLoaded(id, sig),
                            signal: controller.signal,
                        },
                    );
                    if (controller.signal.aborted) return;
                    runInAction(() => {
                        for (const id of ids) {
                            const target = this._treeState.getNode(id);
                            if (target) target.isVisible = visible;
                        }
                    });
                },
                controller.signal,
            );
        } catch (e) {
            if (controller.signal.aborted) return;
            logger.error(`Failed to set visibility for group ${nodeId}:`, e);
        } finally {
            if (this._visibilityControllers.get(nodeId) === controller) {
                this._visibilityControllers.delete(nodeId);
            }
        }
    }

    /**
     * Extent a node zooms to: its own bbox when it carries one, otherwise the
     * union of all visible layer nodes in its subtree. `null` when neither
     * resolves — the zoom affordance stays disabled. Derived on demand —
     * no cache.
     */
    getZoomExtent(nodeId: string): Bbox | null {
        const own = this._treeState.getNode(nodeId)?.bbox;
        if (own) return own;

        const bboxes = collectVisibleBboxes(this._treeState, nodeId);
        return bboxes.reduce<Bbox | null>((acc, b) => unionBbox(acc, b), null);
    }

    initAdapter(type: string): void {
        const adapter = this.sources.get(type);
        if (!adapter) {
            throw new Error(
                `No source adapter registered for type "${type}" — an explicit init error, never a silent empty tree.`,
            );
        }
        this._sourceType = type;
        this._disposeAdapter();
        const url = this.rootStore.settingsStore.getStringSetting(
            DATA_SOURCE_URL_SETTING,
        );
        if (url) adapter.initialize({ url });
        this._adapter = adapter;
    }

    private async _withLoadingState<T>(
        id: string,
        task: () => Promise<T>,
        signal?: AbortSignal,
    ): Promise<T> {
        try {
            const result = await this._async.run(id, task, signal);
            if (this._lastFailedKey === id) {
                runInAction(() => {
                    this._lastFailedKey = null;
                });
            }
            return result;
        } catch (e) {
            if (!signal?.aborted) {
                runInAction(() => {
                    this._lastFailedKey = id;
                });
            }
            throw e;
        }
    }

    private _beginReload(key: string): number {
        const generation = (this._reloadGenerations.get(key) ?? 0) + 1;
        this._reloadGenerations.set(key, generation);
        return generation;
    }

    private _isCurrentReload(key: string, generation: number): boolean {
        return this._reloadGenerations.get(key) === generation;
    }

    private async _reloadSubtree(
        parentId: string,
        signal?: AbortSignal,
    ): Promise<void> {
        const generation = this._beginReload(parentId);
        await this._withLoadingState(parentId, async () => {
            const adapter = this._adapter;
            if (!adapter) throw new Error("No active data source");
            const node = this._treeState.getNode(parentId);
            if (!node || !isGroupNode(node)) return;

            const children = await adapter.fetchChildren(node);
            if (
                signal?.aborted ||
                this._adapter !== adapter ||
                !this._isCurrentReload(parentId, generation)
            ) {
                return;
            }

            const result = reconcileTree({
                state: this._treeState,
                parentId,
                incomingNodes: children,
            });

            this.applyResult(result, parentId, children);
        });
    }

    private async _reloadRoot(signal?: AbortSignal): Promise<void> {
        const generation = this._beginReload(LayerTreeStore.TREE_ROOT);
        await this._withLoadingState(LayerTreeStore.TREE_ROOT, async () => {
            const adapter = this._adapter;
            if (!adapter) return;
            const nodes = await adapter.fetchRoot();
            if (
                signal?.aborted ||
                this._adapter !== adapter ||
                !this._isCurrentReload(LayerTreeStore.TREE_ROOT, generation)
            ) {
                return;
            }

            const result = reconcileTree({
                state: this._treeState,
                parentId: null,
                incomingNodes: nodes,
            });

            this.applyResult(result, null, nodes);
        });
    }

    /** Single mutation entry point — applies {@link OperationResult} to observable state. */
    private applyResult(
        result: OperationResult,
        parentId: string | null,
        incomingNodes?: readonly TreeNode[],
    ): void {
        const nodes = incomingNodes ?? [];
        const newIds = nodes.map((n) => n.id);

        runInAction(() => {
            this._deleteNodes(result.removed);
            const emptiedGroups = nodes.filter(
                (n): n is GroupNode =>
                    isGroupNode(n) &&
                    n.childrenIds.length === 0 &&
                    this._loadedGroups.has(n.id),
            );
            this._registerNodes(nodes, parentId);
            for (const group of emptiedGroups) {
                this._loadedGroups.delete(group.id);
            }
            this._updateChildrenIds(parentId, newIds);
        });
    }

    private _deleteNodes(ids: string[]): void {
        for (const id of ids) {
            this._nodes.delete(id);
            // A re-added group starts unloaded again.
            this._loadedGroups.delete(id);
        }
    }

    private _registerNodes(
        nodes: readonly TreeNode[],
        parentId: string | null,
    ): void {
        for (const incoming of nodes) {
            const existing = this._nodes.get(incoming.id);
            const merged = existing
                ? mergeUserState(existing, incoming)
                : incoming;
            this._nodes.set(
                merged.id,
                observable({ ...merged, parentId }, undefined, { deep: true }),
            );
        }
    }

    private _updateChildrenIds(
        parentId: string | null,
        childIds: string[],
    ): void {
        if (parentId === null) {
            this._rootIds.replace(childIds);
            return;
        }
        const parent = this._treeState.getNode(parentId);
        if (parent && isGroupNode(parent)) {
            // The node was deep-wrapped at registration, so a plain property
            // write is observable; the contract type keeps childrenIds
            // readonly, and Object.assign is the cast-free write at this seam.
            Object.assign(parent, { childrenIds: childIds });
            parent.childrenCount = childIds.length;
            // The child batch arrived — empty counts as loaded.
            this._loadedGroups.add(parentId);
        }
    }

    get rootNodes(): TreeNode[] {
        return resolveNodes(this._treeState, this._rootIds);
    }

    get allLayerNodes(): LayerNode[] {
        return collectLayerNodes(this._treeState);
    }

    get layerSnapshot(): SnapshotItem[] {
        return this._layerSnapshot.get();
    }

    get treeState(): TreeState {
        return this._treeState;
    }

    node(nodeId: string): TreeNode | undefined {
        return this._treeState.getNode(nodeId);
    }

    childrenOf(parentId: string): TreeNode[] {
        return resolveNodes(
            this._treeState,
            this._treeState.childrenOf(parentId),
        );
    }

    dispose(): void {
        for (const controller of this._visibilityControllers.values()) {
            controller.abort();
        }
        this._visibilityControllers.clear();
        this._disposeSync?.();
        this._disposeSync = undefined;
        this._disposeAdapter();
    }

    constructor(readonly rootStore: StoreRegistry) {
        makeAutoObservable<
            this,
            | "_async"
            | "_treeState"
            | "protocols"
            | "sources"
            | "_disposeSync"
            | "_visibilityControllers"
        >(this, {
            rootStore: false,
            _async: false,
            _treeState: false,
            protocols: false,
            sources: false,
            _disposeSync: false,
            _visibilityControllers: false,
        });

        this.protocols = rootStore.protocolRegistry;
        this.sources = rootStore.sourceAdapterFactory;

        const capturedRootIds = this._rootIds;
        this._treeState = {
            getNode: (id) => this._nodes.get(id),
            childrenOf: (parentId) => {
                const node = this._nodes.get(parentId);
                return node && isGroupNode(node) ? node.childrenIds : [];
            },
            get rootIds() {
                return capturedRootIds;
            },
        };

        const { reaction } = createCancellableReaction(
            () =>
                this.rootStore.settingsStore.getStringSetting(
                    DATA_SOURCE_URL_SETTING,
                ),
            this._handleDataSourceUrlChange,
            { name: "layer-tree-url-sync" },
        );

        this._disposeSync = reaction;
    }

    private _handleDataSourceUrlChange = async (
        newUrl: string | undefined,
        signal: AbortSignal,
    ): Promise<void> => {
        if (!newUrl) {
            this._clearTree("Data source URL cleared");
            this._disposeAdapter();
            return;
        }
        // Before the first init the bootstrap owns adapter setup;
        // `refresh` no-ops without an adapter, so the boot path stays single.
        if (this._sourceType !== undefined) {
            this.initAdapter(this._sourceType);
        }
        await this.refresh(undefined, signal);
    };

    private _clearTree(errorMessage: string): void {
        runInAction(() => {
            this._stateError = errorMessage;
            this._nodes.clear();
            this._rootIds.replace([]);
        });
    }

    private _disposeAdapter(): void {
        this._adapter?.dispose();
        this._adapter = undefined;
    }
}
