import {
    makeAutoObservable,
    runInAction,
    observable,
    computed,
    comparer,
    flow,
    flowResult,
    type IObservableArray,
    toJS,
} from "mobx";
import {
    type TreeNode,
    type LayerNode,
    type LayerRole,
    type LayerConfigFor,
    type RenderDescriptor,
    type SourceAdapter,
    type SnapshotItem,
    isGroupNode,
    isLayerNode,
    updateDescriptorConfig,
} from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";
import { createCancellableReaction } from "@core/shared/async";
import { traverseTreeAsync } from "@core/shared/async/treeTraversal";
import { debounce } from "@core/shared";
import type { RootStore } from "@core/framework/store";

const DATA_SOURCE_URL_SETTING = "layer-tree.data-source-url";
const SEARCH_DEBOUNCE_MS = 300;

export class LayerTreeStore {
    private _nodes = observable.map<string, TreeNode>();
    rootIds: IObservableArray<string> = observable.array<string>([]);
    loading: boolean = false;
    error: string | null = null;

    // Search state
    private _searchResultIds = observable.set<string>();
    private _searchAbortController: AbortController | null = null;
    isSearchLoading: boolean = false;

    /** Set of node IDs currently loading their children. */
    loadingNodeIds: Set<string> = observable.set<string>();

    private _adapter: SourceAdapter | null = null;
    private _urlReactionDisposer?: () => void;

    // === Panel state (former LayerPanelStore) ===
    /** ID of node whose "More" panel is currently open, null if none */
    openPanelNodeId: string | null = null;

    // === Search state (former LayerSearchStore) ===
    searchQuery: string = "";
    private _debouncedSearch = debounce(
        (q: string) => this.searchTree(q),
        SEARCH_DEBOUNCE_MS,
    );

    constructor(readonly rootStore: RootStore) {
        makeAutoObservable(this, { rootStore: false, layerNodes: false });
        this.setupReactions();
    }

    // === Panel methods (former LayerPanelStore) ===

    togglePanel(nodeId: string | null): void {
        this.openPanelNodeId = this.openPanelNodeId === nodeId ? null : nodeId;
    }

    isNodePanelOpen(nodeId: string): boolean {
        return this.openPanelNodeId === nodeId;
    }

    // === Search methods (former LayerSearchStore) ===

    setSearchQuery(query: string): void {
        this.searchQuery = query.trim();
        this._debouncedSearch(this.searchQuery);
    }

    clearSearch(): void {
        this.searchQuery = "";
        this._debouncedSearch.cancel?.();
        this.searchTree("");
    }

    get isSearching(): boolean {
        return this.searchQuery !== "";
    }

    // === Visibility convenience accessor ===

    get visibility() {
        return this.rootStore.visibilityStore;
    }

    private get _isAdapterReady(): boolean {
        return this._adapter !== null;
    }

    private get _dataSourceUrl(): string | undefined {
        return this.rootStore.settingsStore.getStringSetting(
            DATA_SOURCE_URL_SETTING,
        );
    }

    private setupReactions(): void {
        const result = createCancellableReaction(
            () => this._dataSourceUrl,
            async (newUrl, signal) => {
                if (!newUrl) {
                    runInAction(() => {
                        this.error = "Data source URL cleared";
                        this._nodes.clear();
                        this.rootIds.replace([]);
                    });
                    this.visibility.clearAllExtentCaches();
                    return;
                }

                await this._initAdapter(newUrl);
                if (signal.aborted) return;

                await this.fetchLayerTree(signal);
            },
            { name: "layer-tree-data-source-url-sync" },
        );

        this._urlReactionDisposer = result.reaction;
    }

    private async _initAdapter(url: string): Promise<void> {
        if (!this.rootStore.sourceAdapterFactory.hasDefault()) {
            return;
        }

        const adapter = this.rootStore.sourceAdapterFactory.getDefault();

        // Dispose the previous adapter BEFORE initializing the new one.
        this._adapter?.dispose?.();
        this._adapter = null;

        if (adapter.initialize) {
            const result = adapter.initialize({ url });
            if (result instanceof Promise) {
                await result;
            }
        }

        runInAction(() => {
            this._adapter = adapter;
        });
    }

    dispose(): void {
        this._urlReactionDisposer?.();
        this._adapter?.dispose?.();
        this._adapter = null;
        this.visibility.dispose();
    }

    private _setLoadingState(
        loading: boolean,
        error: string | null = null,
    ): void {
        this.loading = loading;
        this.error = error;
    }

    private _handleError(error: unknown, context: string): void {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`${context}:`, error);
        this._setLoadingState(false, message);
    }

    async ensureLayerTreeLoaded(signal?: AbortSignal): Promise<void> {
        if (this.rootIds.length === 0 && !this.loading && !this.error) {
            await this.fetchLayerTree(signal);
        }
    }

    async fetchLayerTree(signal?: AbortSignal): Promise<void> {
        if (!this._isAdapterReady) {
            await this._initAdapterFromSettings();
            if (!this._isAdapterReady || signal?.aborted) return;
        }

        this.clearSearch();
        this._setLoadingState(true, null);

        try {
            const treeNodes = await this._adapter!.fetchRoot();
            if (signal?.aborted) return;

            runInAction(() => {
                this._nodes.clear();
                this.buildTreeFromNodes(treeNodes, null);
            });
            this.visibility.clearAllExtentCaches();
            this._setLoadingState(false);
        } catch (error) {
            if (signal?.aborted) return;
            this._handleError(error, "Failed to fetch layer tree");
        }
    }

    refreshLayerTree = flow(function* (this: LayerTreeStore) {
        const savedQuery = this.searchQuery;
        yield flowResult(this.fetchLayerTree());
        if (savedQuery) {
            this.setSearchQuery(savedQuery);
        }
    });

    private async _initAdapterFromSettings(): Promise<void> {
        const url = this._dataSourceUrl;
        if (!url) {
            this._setLoadingState(false, "No data source URL configured");
            return;
        }

        try {
            await this._initAdapter(url);
            if (!this._adapter) {
                this._setLoadingState(
                    false,
                    "No data source adapter available",
                );
            }
        } catch (error) {
            this._handleError(error, "Failed to initialize data source");
        }
    }

    async toggleCollectionExpanded(
        nodeId: string,
        signal?: AbortSignal,
    ): Promise<void> {
        const node = this.getNode(nodeId);
        if (!node || !isGroupNode(node)) {
            logger.error(`Group ${nodeId} not found`);
            return;
        }

        if (node.isExtended) {
            node.isExtended = false;
            return;
        }

        node.isExtended = true;

        if (node.childrenIds.length === 0) {
            await this.loadChildren(nodeId, signal);
        }
    }

    async loadChildren(nodeId: string, signal?: AbortSignal): Promise<void> {
        if (!this._adapter) {
            const node = this.getNode(nodeId);
            if (node && isGroupNode(node)) {
                node.isExtended = false;
            }
            this._setLoadingState(false, "No active data source");
            return;
        }

        const node = this.getNode(nodeId);
        if (!node) return;

        this._setLoadingState(true);
        runInAction(() => {
            this.loadingNodeIds.add(nodeId);
        });

        try {
            const childTreeNodes = await this._adapter.fetchChildren(node);
            if (signal?.aborted) return;

            runInAction(() => {
                const parent = this.getNode(nodeId);
                if (parent && isGroupNode(parent)) {
                    const newIds = new Set(childTreeNodes.map((n) => n.id));
                    for (const oldChildId of parent.childrenIds) {
                        if (!newIds.has(oldChildId)) {
                            this._removeNodeSubtree(oldChildId);
                        }
                    }
                    parent.childrenCount = childTreeNodes.length;
                }
                this.buildTreeFromNodes(childTreeNodes, nodeId);
            });
            this._setLoadingState(false);
        } catch (error) {
            if (signal?.aborted) return;

            runInAction(() => {
                const n = this.getNode(nodeId);
                if (n && isGroupNode(n)) {
                    n.isExtended = false;
                }
            });
            this._handleError(error, `Failed to expand group ${nodeId}`);
        } finally {
            runInAction(() => {
                this.loadingNodeIds.delete(nodeId);
            });
        }
    }

    updateLayerConfig<TRole extends LayerRole>(
        nodeId: string,
        updates: Partial<LayerConfigFor<TRole>>,
    ): void {
        const node = this.getNode(nodeId);
        if (!node || !isLayerNode(node)) {
            logger.error(`Layer node ${nodeId} not found`);
            return;
        }
        const { display } = node.roles;
        if (!display) return;
        display.render = updateDescriptorConfig(
            display.render as RenderDescriptor<TRole>,
            updates,
        );
        this.visibility.clearExtentCache(nodeId);
    }

    get rootNodes(): TreeNode[] {
        return this.rootIds
            .map((id) => this.getNode(id))
            .filter((node): node is TreeNode => node !== null);
    }

    get visibleRootNodes(): TreeNode[] {
        if (!this.isSearching) return this.rootNodes;
        return this.rootNodes.filter((n) => this.searchResultIds.has(n.id));
    }

    getNode(nodeId: string): TreeNode | null {
        return this._nodes.get(nodeId) ?? null;
    }

    get searchResultIds(): ReadonlySet<string> {
        return this._searchResultIds;
    }

    async searchTree(query: string): Promise<void> {
        // Cancel previous search
        this._searchAbortController?.abort();

        if (!query.trim()) {
            this._searchResultIds.clear();
            this.isSearchLoading = false;
            return;
        }

        const controller = new AbortController();
        this._searchAbortController = controller;

        this.isSearchLoading = true;
        this._searchResultIds.clear();

        const queryLower = query.toLowerCase();

        try {
            const result = await traverseTreeAsync(this, this.rootIds, {
                predicate: (node) =>
                    node.title.toLowerCase().includes(queryLower) ||
                    node.description.toLowerCase().includes(queryLower),
                signal: controller.signal,
                loadUnloaded: true,
            });

            if (controller.signal.aborted) return;

            runInAction(() => {
                this._searchResultIds.replace(result.matchedIds);
                this.isSearchLoading = false;
            });
        } catch {
            if (controller.signal.aborted) return;
            runInAction(() => {
                this.isSearchLoading = false;
            });
        }
    }

    getChildNodes(parentId: string): TreeNode[] {
        const parent = this.getNode(parentId);
        if (!parent || !isGroupNode(parent)) return [];

        const isSearching = this._searchResultIds.size > 0;
        const childIds = isSearching
            ? parent.childrenIds.filter((id) => this._searchResultIds.has(id))
            : [...parent.childrenIds];

        return childIds
            .map((id) => this.getNode(id))
            .filter((node): node is TreeNode => node !== null);
    }

    get layerNodes(): LayerNode[] {
        return this._collectLayerNodes();
    }

    private _collectLayerNodes(): LayerNode[] {
        const result: LayerNode[] = [];
        const stack = [...this.rootIds];

        while (stack.length > 0) {
            const nodeId = stack.pop()!;
            const node = this._nodes.get(nodeId);
            if (!node) continue;

            if (isLayerNode(node)) {
                result.push(node);
            }

            if (isGroupNode(node)) {
                for (let i = node.childrenIds.length - 1; i >= 0; i--) {
                    const childId = node.childrenIds[i];
                    if (childId !== undefined) {
                        stack.push(childId);
                    }
                }
            }
        }

        return result;
    }

    /**
     * Snapshot of layer nodes with display role data for reactive sync.
     * Computed with structural equality to avoid unnecessary reactions
     * when the underlying data hasn't actually changed.
     */
    get layerSnapshot(): SnapshotItem[] {
        return this._layerSnapshot.get();
    }

    private _layerSnapshot = computed<SnapshotItem[]>(
        () => {
            return this._collectLayerNodes().map((node) => {
                const { display } = node.roles;
                return {
                    id: node.id,
                    visible: node.isVisible,
                    descriptor: display ? toJS(display.render) : null,
                };
            });
        },
        { equals: comparer.structural },
    );

    clearError(): void {
        this.error = null;
    }

    /**
     * Recursively removes a node and all its descendants from _nodes.
     * Used to clean up orphaned subtrees when a group is reloaded.
     */
    private _removeNodeSubtree(nodeId: string): void {
        const node = this._nodes.get(nodeId);
        if (node && isGroupNode(node)) {
            for (const childId of node.childrenIds) {
                this._removeNodeSubtree(childId);
            }
        }
        this.visibility.clearExtentCache(nodeId);
        this._nodes.delete(nodeId);
    }

    private buildTreeFromNodes(
        nodes: TreeNode[],
        parentId: string | null,
    ): string[] {
        // Clean up orphaned nodes not present in the new tree
        if (parentId === null) {
            const newIds = new Set(nodes.map((n) => n.id));
            for (const [id] of this._nodes) {
                if (!newIds.has(id)) {
                    this.visibility.clearExtentCache(id);
                    this._nodes.delete(id);
                }
            }
        }

        const childIds = nodes.map((node) => {
            const observableNode = observable(
                {
                    ...node,
                    parentId,
                },
                undefined,
                { deep: true },
            );
            this._nodes.set(node.id, observableNode);
            return node.id;
        });

        if (parentId) {
            const parent = this.getNode(parentId);
            if (parent && isGroupNode(parent)) {
                parent.childrenIds.replace(childIds);
            }
        } else {
            this.rootIds.replace(childIds);
        }

        return childIds;
    }
}
