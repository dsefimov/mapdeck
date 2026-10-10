import { makeAutoObservable, flow } from "mobx";
import { LayerTreeStore, ToolStore } from "@core/domain/layer-tree";
import { MapStore, BasemapStore, MapToolStore } from "@core/domain/map";
import {
    SourceAdapterFactory,
    ProtocolRegistry,
    FeatureProviderRegistry,
} from "@core/domain/protocols";
import { SettingsStore } from "@core/common/settings";
import { WidgetStore } from "@core/common/widget";
import { LocaleStore, coreTranslations } from "@core/common/locale";
import { StateStore } from "@core/lib/state/StateStore";
import { logger } from "@core/lib/logger";
import type {
    ModuleContext,
    ToolRuntimeContext,
} from "@core/contracts";

import type { StoreRegistry } from "@core/store-registry";

/** A store that releases acquired resources in `dispose()`. */
interface Disposable {
    dispose(): void;
}

function isDisposable(store: object): store is Disposable {
    return "dispose" in store && typeof store.dispose === "function";
}

/**
 * The composition root: the one place where the kernel's stores
 * are instantiated and wired into the {@link StoreRegistry}.
 *
 * Three responsibilities beyond the store graph itself:
 * - extension contexts — narrow declared-points views over the same store
 *   instances for modules and tool panels; extensions never receive the
 *   registry itself, so kernel refactorings cannot break them;
 * - initialization gate — `isInitialized`/`initError` switch the App between
 *   loading / error / workspace screens;
 * - teardown — `dispose()` walks the construction order reversed, which is
 *   what makes the fresh-store retry in main.tsx safe.
 */
export class RootStore implements StoreRegistry {
    readonly sourceAdapterFactory: SourceAdapterFactory;
    readonly protocolRegistry: ProtocolRegistry;
    readonly featureProviderRegistry: FeatureProviderRegistry;

    readonly localeStore: LocaleStore;
    readonly settingsStore: SettingsStore;
    readonly stateStore: StateStore;
    readonly treeStore: LayerTreeStore;
    readonly layerToolStore: ToolStore;
    readonly mapStore: MapStore;
    readonly basemapStore: BasemapStore;
    readonly mapToolStore: MapToolStore;
    readonly widgetStore: WidgetStore;

    /** Declared-points context for tool panels. */
    readonly toolContext: ToolRuntimeContext;

    /** Declared-points registration context for modules. */
    readonly moduleContext: ModuleContext;

    /** Whether `initialize()` has completed successfully; the App's boot gate. */
    isInitialized = false;

    /** Failure message of the last `initialize()` run; null while loading or initialized. */
    initError: string | null = null;

    /**
     * Everything created by the constructor, in construction order —
     * `dispose()` walks it reversed. Recording here keeps the teardown
     * list from duplicating the wiring above by hand.
     */
    private readonly _constructionOrder: object[] = [];

    constructor() {
        // Construction order is the dependency graph: registries
        // and service stores (locale, settings, state) are read during later
        // construction, so they are created first.
        this.sourceAdapterFactory = this._track(new SourceAdapterFactory());
        this.protocolRegistry = this._track(new ProtocolRegistry());
        this.featureProviderRegistry = this._track(
            new FeatureProviderRegistry(),
        );
        this.localeStore = this._track(new LocaleStore());
        this.localeStore.registerTranslations("core", coreTranslations);
        this.settingsStore = this._track(new SettingsStore());
        this.stateStore = this._track(new StateStore());
        this.treeStore = this._track(new LayerTreeStore(this));
        this.layerToolStore = this._track(new ToolStore(this));
        this.mapStore = this._track(new MapStore(this));
        this.basemapStore = this._track(new BasemapStore(this));
        this.mapToolStore = this._track(new MapToolStore(this));
        this.widgetStore = this._track(new WidgetStore(this));

        // Plain views, not wrappers: each store structurally implements its
        // contract port, so the contexts are assembled from the instances.
        this.toolContext = {
            stateStore: this.stateStore,
            locale: this.localeStore,
            protocols: this.protocolRegistry,
            featureProviders: this.featureProviderRegistry,
            layerTree: this.treeStore,
            mapToolState: this.mapToolStore,
            basemap: this.basemapStore,
        };
        this.moduleContext = {
            ...this.toolContext,
            // Spread members carry the runtime slice's declared read-only
            // types; these lines restore the registration views.
            protocols: this.protocolRegistry,
            featureProviders: this.featureProviderRegistry,
            locale: this.localeStore,
            settings: this.settingsStore,
            basemap: this.basemapStore,
            sourceAdapterFactory: this.sourceAdapterFactory,
            widgets: this.widgetStore,
            layerTools: this.layerToolStore,
            mapTools: this.mapToolStore,
        };

        // Wiring, not state: stable views and teardown bookkeeping stay
        // outside observability.
        makeAutoObservable<this, "_constructionOrder">(this, {
            toolContext: false,
            moduleContext: false,
            _constructionOrder: false,
        });
    }

    /** Records a created store for reverse-order disposal; returns it unchanged. */
    private _track<T extends object>(store: T): T {
        this._constructionOrder.push(store);
        return store;
    }

    /** Disposes every store that acquired resources, in reverse construction order. */
    dispose(): void {
        const storesInReverse = [...this._constructionOrder].reverse();
        for (const store of storesInReverse) {
            if (isDisposable(store)) store.dispose();
        }
    }

    /**
     * Boots the initial source adapter and the first tree fetch; records the
     * outcome. The default source type is assembly policy — the caller
     * (bootstrap) passes it in.
     */
    initialize = flow(function* (this: RootStore, defaultSourceType: string) {
        this.clearInitError();
        this.isInitialized = false;
        try {
            if (!defaultSourceType) {
                throw new Error(
                    "No default source type declared — the assembly must declare one.",
                );
            }
            this.treeStore.initAdapter(defaultSourceType);
            yield this.treeStore.refresh();
            this.isInitialized = true;
        } catch (error) {
            logger.error("Failed to initialize app:", error);
            this.setInitError(error);
        }
    });

    /**
     * Records a failed boot attempt as a readable message; a non-Error value
     * becomes "Unknown error". Called by bootstrap when a registration step
     * fails, and by `initialize()` on a failed tree refresh.
     */
    setInitError(error: unknown): void {
        this.initError =
            error instanceof Error ? error.message : "Unknown error";
    }

    /** Clears a stale error without touching the initialized flag. */
    clearInitError(): void {
        this.initError = null;
    }
}
