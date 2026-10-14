import { makeAutoObservable, observable, runInAction } from "mobx";
import { debounce } from "@core/lib/async/debounce";
import { searchTree, type TreeState } from "@core/domain/layer-tree";
import { isGroupNode } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";

const SEARCH_DEBOUNCE_MS = 300;

export interface VisibleRow {
    nodeId: string;
    depth: number;
}

/**
 * Display model of the Layers widget (Qt QSortFilterProxyModel analogy).
 *
 * Owns all view state — expansion (`expandedIds`), the single open menu
 * (`openMenuId`), and search (`searchQuery`/`matchedIds`) — and computes the
 * flat `visibleRows` list the components render. View state survives tree
 * reloads by stable node ids; stale ids produce no rows.
 */
export class LayerTreeViewModel {
    readonly expandedIds = observable.set<string>();
    openMenuId: string | null = null;
    searchQuery = "";
    readonly matchedIds = observable.set<string>();

    private _searchAbortController: AbortController | null = null;
    private _searchPending = false;
    private _pendingExpansion = new Map<string, AbortController>();
    private _debouncedSearch: ReturnType<typeof debounce<[string]>>;

    constructor(readonly rootStore: StoreRegistry) {
        makeAutoObservable<
            this,
            "_searchAbortController" | "_pendingExpansion" | "_debouncedSearch"
        >(
            this,
            {
                rootStore: false,
                _searchAbortController: false,
                _pendingExpansion: false,
                _debouncedSearch: false,
            },
            // Methods are passed as props to components — bind them so `this`
            // survives the reference hand-off.
            { autoBind: true },
        );
        this._debouncedSearch = debounce((query: string) => {
            void this._runSearch(query);
        }, SEARCH_DEBOUNCE_MS);
    }

    private get treeStore() {
        return this.rootStore.treeStore;
    }

    /** Flat row list in tree order. */
    get visibleRows(): VisibleRow[] {
        const state = this.treeStore.treeState;
        const rows: VisibleRow[] = [];

        // While a search is pending (debounce not fired / run in flight), the
        // search has no results yet — keep the expansion view visible instead
        // of flashing an empty tree on every keystroke.
        if (this.searchQuery !== "" && !this._searchPending) {
            this._collectSearchRows(rows, state);
        } else {
            this._collectExpansionRows(rows, state);
        }

        return rows;
    }

    /**
     * Toggles a group's expansion. Expanding a group with no loaded children
     * starts a lazy load; on load failure or abort the expansion rolls back.
     */
    toggleExpanded(nodeId: string): void {
        const node = this.treeStore.node(nodeId);
        if (!node || !isGroupNode(node)) return;

        if (this.expandedIds.has(nodeId)) {
            this.expandedIds.delete(nodeId);
            return;
        }

        this.expandedIds.add(nodeId);
        if (node.childrenIds.length === 0) {
            void this._loadChildren(nodeId);
        }
    }

    async refreshTree(signal?: AbortSignal): Promise<void> {
        await this.treeStore.refresh(undefined, signal);
        if (signal?.aborted) return;
        await this._reloadExpandedLevels(signal);
    }

    private async _reloadExpandedLevels(
        signal?: AbortSignal,
    ): Promise<void> {
        let level = this._expandedAmong(
            this.treeStore.rootNodes.map((node) => node.id),
        );
        while (level.length > 0) {
            if (signal?.aborted) return;
            const nextLevel: string[] = [];
            for (const nodeId of level) {
                await this._loadChildren(nodeId);
                if (signal?.aborted) return;
                nextLevel.push(
                    ...this._expandedAmong(
                        this.treeStore
                            .childrenOf(nodeId)
                            .map((node) => node.id),
                    ),
                );
            }
            level = nextLevel;
        }
    }

    private _expandedAmong(ids: readonly string[]): string[] {
        return ids.filter((id) => this.expandedIds.has(id));
    }

    /** Opens the node's menu, or closes it when the same node is toggled. */
    openMenu(nodeId: string): void {
        this.openMenuId = this.openMenuId === nodeId ? null : nodeId;
    }

    closeMenu(): void {
        this.openMenuId = null;
    }

    /**
     * Owns the search lifecycle. Empty/whitespace input clears the search
     * immediately; non-empty input is debounced before running the core
     * `searchTree` operation.
     */
    setSearchQuery(text: string): void {
        const trimmed = text.trim();
        this.searchQuery = trimmed;

        if (!trimmed) {
            this._searchAbortController?.abort();
            this._debouncedSearch.cancel?.();
            this._searchPending = false;
            this.matchedIds.clear();
            return;
        }

        this._searchPending = true;
        this.matchedIds.clear();
        this._debouncedSearch(trimmed);
    }

    private _collectExpansionRows(rows: VisibleRow[], state: TreeState): void {
        const walk = (id: string, depth: number): void => {
            const node = state.getNode(id);
            if (!node) return;
            rows.push({ nodeId: id, depth });
            if (isGroupNode(node) && this.expandedIds.has(id)) {
                for (const childId of state.childrenOf(id)) {
                    walk(childId, depth + 1);
                }
            }
        };
        for (const root of this.treeStore.rootNodes) walk(root.id, 0);
    }

    private _collectSearchRows(rows: VisibleRow[], state: TreeState): void {
        const show = new Set<string>();
        for (const id of this.matchedIds) {
            show.add(id);
            let current = state.getNode(id);
            while (current?.parentId) {
                show.add(current.parentId);
                current = state.getNode(current.parentId);
            }
        }

        const walk = (id: string, depth: number): void => {
            const node = state.getNode(id);
            if (!node) return;
            if (show.has(id)) rows.push({ nodeId: id, depth });
            if (isGroupNode(node)) {
                for (const childId of state.childrenOf(id)) {
                    walk(childId, depth + 1);
                }
            }
        };
        for (const root of this.treeStore.rootNodes) walk(root.id, 0);
    }

    private async _loadChildren(nodeId: string): Promise<void> {
        const controller = new AbortController();
        const previous = this._pendingExpansion.get(nodeId);
        previous?.abort();
        this._pendingExpansion.set(nodeId, controller);

        let failed = false;
        try {
            await this.treeStore.ensureChildrenLoaded(
                nodeId,
                controller.signal,
            );
        } catch {
            failed = true;
        }

        if (this._pendingExpansion.get(nodeId) === controller) {
            this._pendingExpansion.delete(nodeId);
            if (failed || controller.signal.aborted) {
                runInAction(() => {
                    this.expandedIds.delete(nodeId);
                });
            }
        }
    }

    private async _runSearch(query: string): Promise<void> {
        this._searchAbortController?.abort();
        const controller = new AbortController();
        this._searchAbortController = controller;

        try {
            const ids = await searchTree(
                this.treeStore.treeState,
                this.treeStore.rootNodes.map((node) => node.id),
                query,
                {
                    loadChildren: (id, signal) =>
                        this.treeStore.ensureChildrenLoaded(id, signal),
                    signal: controller.signal,
                },
            );
            if (controller.signal.aborted) return;
            runInAction(() => {
                this._searchPending = false;
                this.matchedIds.replace(ids);
            });
        } catch {
            if (controller.signal.aborted) return;
            runInAction(() => {
                this._searchPending = false;
                this.matchedIds.clear();
            });
        }
    }
}
