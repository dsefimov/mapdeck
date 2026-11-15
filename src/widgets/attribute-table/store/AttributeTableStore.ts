import { makeAutoObservable, runInAction } from "mobx";
import type { StoreRegistry } from "@core/store-registry";
import { isLayerNode } from "@core/contracts";
import type {
    AttributeFetchRequest,
    AttributeFetchResult,
    FeatureRow,
} from "@core/contracts";
import { AsyncCache, AsyncState } from "@core/common/state";
import {
    ensureSelectionState,
    stableFeatureKey,
    type SelectionRecord,
    type SelectionStore,
} from "@core/common/selection";
import type { SelectionColumnConfig } from "@core/ui/composites";
import type { Bbox } from "@core/lib/geo";
import {
    buildAttributeLayers,
    extractColumns,
    getFeatureId,
    mergeAttributePage,
    attributeCacheKey,
    type AttributeLayerInfo,
    type AttributePage,
} from "../utils/index";

export const PAGE_SIZE = 500;

const CACHE_TTL_MS = 5 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 30 * 1000;

type SortParams = { sortBy: string; sortDirection: "asc" | "desc" } | undefined;

/** One layer's cached attribute page — the utils' structural shape. */
type CachedAttributes = AttributePage;

/** A row's selection record: the key plus the bbox mark when it has one. */
function rowRecord(feature: FeatureRow, index: number): SelectionRecord {
    return {
        key: getFeatureId(feature, index),
        footprint: feature._bbox
            ? { kind: "bbox", bbox: feature._bbox }
            : null,
    };
}

export class AttributeTableStore {
    selectedLayerId: string | null = null;
    sortColumn: string | null = null;
    sortDirection: "asc" | "desc" | null = null;
    selectionPinnedToTop = false;

    /** The per-layer selection shared with the map tool and the highlight. */
    readonly selection: SelectionStore;

    private readonly maxFeaturesPerRequest: number;
    /** Load/error state of the next-page fetch. */
    private _pageAsync = new AsyncState();
    private readonly _cache = new AsyncCache<string, CachedAttributes>({
        ttl: CACHE_TTL_MS,
        errorTtl: ERROR_CACHE_TTL_MS,
    });

    constructor(
        readonly rootStore: StoreRegistry,
        options: { maxFeaturesPerRequest?: number } = {},
    ) {
        this.maxFeaturesPerRequest = options.maxFeaturesPerRequest ?? 1000;
        this.selection = ensureSelectionState(rootStore);
        makeAutoObservable<this, "_sortParams" | "_pageAsync" | "_cache">(
            this,
            {
                rootStore: false,
                selection: false,
                _sortParams: false,
                _pageAsync: false,
                _cache: false,
            },
        );
    }

    /** Sort params for cache keying. Plain getter (not MobX computed). */
    private get _sortParams(): SortParams {
        return this.sortColumn && this.sortDirection
            ? { sortBy: this.sortColumn, sortDirection: this.sortDirection }
            : undefined;
    }

    get attributeLayers(): AttributeLayerInfo[] {
        return buildAttributeLayers(
            this.rootStore.treeStore.allLayerNodes,
            (id) => this.rootStore.treeStore.node(id),
        );
    }

    /** Data protocol binding for the selected layer (used by external tools, e.g. data export). */
    get dataBinding() {
        if (!this.selectedLayerId) return null;
        const node = this.rootStore.treeStore.node(this.selectedLayerId);
        if (!node || !isLayerNode(node)) return null;
        return node.data ?? null;
    }

    get cachedData(): CachedAttributes | null {
        if (!this.selectedLayerId) return null;
        return this._cache.get(this._cacheKey(this.selectedLayerId)) ?? null;
    }

    get loading(): boolean {
        if (!this.selectedLayerId) return false;
        return this._cache.isLoading(this._cacheKey(this.selectedLayerId));
    }

    get isBusy(): boolean {
        return this.loading || this._pageAsync.isLoading;
    }

    /**
     * Error of the selected layer's most recent fetch. Every fetch path —
     * select, sort, refresh, next page — runs through one cache entry, so
     * the entry's async state is the single source.
     */
    get error(): string | null {
        if (!this.selectedLayerId) return null;
        return this._cache.getError(this._cacheKey(this.selectedLayerId));
    }

    get totalFeatures(): number {
        return this.cachedData?.totalFeatures || 0;
    }

    get loadedFeatures(): FeatureRow[] {
        return this.cachedData?.features ?? [];
    }

    get columns(): string[] {
        return extractColumns(this.loadedFeatures);
    }

    get hasGeometry(): boolean {
        return this.loadedFeatures.some((f) => f._bbox != null);
    }

    get geometryColumn():
        | { key: "_bbox"; onZoom: (bbox: Bbox) => void }
        | undefined {
        if (!this.hasGeometry) return undefined;
        return {
            key: "_bbox" as const,
            onZoom: (bbox: Bbox) => this.rootStore.mapStore.zoomToExtent(bbox),
        };
    }

    get hasMoreFeatures(): boolean {
        if (!this.selectedLayerId) return false;
        const cached = this.cachedData;
        if (!cached) return false;
        return cached.features.length < cached.totalFeatures;
    }

    /** The displayed layer's selection keys — shared, not widget-local. */
    get selectedRowIds(): ReadonlySet<string> {
        if (!this.selectedLayerId) return new Set();
        return this.selection.keysFor(this.selectedLayerId);
    }

    /**
     * Selection wiring for the table's checkbox column. The keys are
     * read as a snapshot — the tracked read re-evaluates this computed
     * (and re-renders the table) whenever the layer's selection changes,
     * whichever surface changed it.
     */
    get selectionColumn(): SelectionColumnConfig | undefined {
        const layerId = this.selectedLayerId;
        if (!layerId) return undefined;
        const selectedRowIds = this.selection.keysFor(layerId);
        return {
            getRowId: (row, index) => getFeatureId(row as FeatureRow, index),
            isSelected: (rowId) => selectedRowIds.has(rowId),
            onToggleRow: (row) => this.toggleRowSelection(row as FeatureRow),
            pinSelectedToTop: this.selectionPinnedToTop,
        };
    }

    toggleSelectionPinnedToTop = (): void => {
        this.selectionPinnedToTop = !this.selectionPinnedToTop;
    };

    selectLayer = async (layerId: string | null): Promise<void> => {
        runInAction(() => {
            this.selectedLayerId = layerId;
            this.sortColumn = null;
            this.sortDirection = null;
        });

        if (layerId) {
            // Clear cache if previous fetch had an error, so we retry immediately
            const key = this._cacheKey(layerId);
            if (this._cache.getError(key)) {
                this._cache.invalidate(key);
            }

            await this._fetch(layerId, {
                startIndex: 0,
                maxFeatures: PAGE_SIZE,
            });
        }
    };

    loadNextPage = async (totalNeeded = PAGE_SIZE): Promise<void> => {
        const id = this.selectedLayerId;
        if (!id || this._pageAsync.isLoading) return;

        const cached = this._cache.get(this._cacheKey(id));
        if (!cached || cached.features.length >= cached.totalFeatures) return;

        await this._pageAsync
            .run(() => this._fetchNextBatch(totalNeeded))
            .catch(() => undefined);
    };

    private _fetchNextBatch = async (needed: number): Promise<void> => {
        const layerId = this.selectedLayerId;
        if (!layerId) return;
        const cached = this._cache.get(this._cacheKey(layerId));
        if (!cached) return;
        const batchSize = Math.min(
            Math.max(PAGE_SIZE, needed),
            this.maxFeaturesPerRequest,
        );
        await this._fetch(layerId, {
            startIndex: cached.features.length,
            maxFeatures: batchSize,
            ...this._sortParams,
        });
    };

    setSort = async (
        column: string | null,
        direction: "asc" | "desc" | null,
    ): Promise<void> => {
        runInAction(() => {
            this.sortColumn = column;
            this.sortDirection = direction;
        });

        if (!this.selectedLayerId) return;

        this._cache.invalidate(this._cacheKey(this.selectedLayerId));

        await this._fetch(
            this.selectedLayerId,
            {
                startIndex: 0,
                maxFeatures: PAGE_SIZE,
                ...this._sortParams,
            },
            { dropIndexKeyed: true },
        );
    };

    toggleRowSelection = (feature: FeatureRow): void => {
        const layerId = this.selectedLayerId;
        if (!layerId) return;
        const index = this.loadedFeatures.indexOf(feature);
        if (index < 0) return;
        runInAction(() => {
            this.selection.toggleRecord(layerId, rowRecord(feature, index));
        });
    };

    selectAllRows = (): void => {
        const layerId = this.selectedLayerId;
        if (!layerId) return;
        const features = this.loadedFeatures;
        runInAction(() => {
            this.selection.applySelection(
                layerId,
                features.map(rowRecord),
                "new",
            );
        });
    };

    clearSelection = (): void => {
        const layerId = this.selectedLayerId;
        if (!layerId) return;
        runInAction(() => {
            this.selection.clearLayer(layerId);
        });
    };

    refreshData = async (): Promise<void> => {
        if (!this.selectedLayerId) return;

        this._cache.invalidate(this._cacheKey(this.selectedLayerId));

        await this._fetch(
            this.selectedLayerId,
            {
                startIndex: 0,
                maxFeatures: PAGE_SIZE,
                ...this._sortParams,
            },
            { dropIndexKeyed: true },
        );
    };

    clearError = (): void => {
        if (this.selectedLayerId) {
            this._cache.clearError(this._cacheKey(this.selectedLayerId));
        }
    };

    private _cacheKey(layerId: string): string {
        return attributeCacheKey(layerId, this._sortParams);
    }

    private async _fetch(
        layerId: string,
        request: AttributeFetchRequest,
        opts: { dropIndexKeyed?: boolean } = {},
    ): Promise<void> {
        const key = this._cacheKey(layerId);
        try {
            await this._cache.fetch(key, (prev) =>
                this._load(layerId, prev, request, opts),
            );
        } catch {
            // The failure is recorded on the cache entry and surfaces via
            // `get error()`; callers are fire-and-forget, so the rejection
            // is deliberately not rethrown.
        }
    }

    private async _load(
        layerId: string,
        prev: CachedAttributes | undefined,
        request: AttributeFetchRequest,
        opts: { dropIndexKeyed?: boolean } = {},
    ): Promise<CachedAttributes> {
        const binding = this._dataBinding(layerId);
        const protocol = this.rootStore.protocolRegistry.getById(
            binding.protocolId,
        );
        if (!protocol?.fetchAttributes) {
            throw new Error(`No data protocol for ${binding.protocolId}`);
        }

        const result: AttributeFetchResult = await protocol.fetchAttributes(
            binding,
            request,
        );
        const merged = mergeAttributePage(
            prev?.features,
            result,
            request.startIndex ?? 0,
        );
        // The loaded rows are the authority on whether this layer's
        // features carry an id field — the panel's sync hint reads it.
        runInAction(() => {
            this.selection.markStableIds(
                layerId,
                merged.features.some(
                    (feature) => stableFeatureKey(feature) !== null,
                ),
            );
            // Freshly committed rows may have re-targeted index-based
            // keys (`row-<i>`) — only on commit, so a failed refetch
            // keeps the selection along with the previous data.
            if (opts.dropIndexKeyed) {
                this.selection.retainStableKeys(layerId);
            }
        });
        return merged;
    }

    private _dataBinding(layerId: string): {
        protocolId: string;
        sourceUrl: string;
        params: Record<string, unknown>;
    } {
        const node = this.rootStore.treeStore.node(layerId);
        if (!node || !isLayerNode(node))
            throw new Error(`Node ${layerId} not found or not a layer`);
        const binding = node.data;
        if (!binding)
            throw new Error(`No data protocol binding for ${layerId}`);
        return binding;
    }
}
