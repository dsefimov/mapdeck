import { makeAutoObservable, flow } from "mobx";
import { LayerTreeStore } from "../layer/LayerTreeStore";
import { LayerVisibilityStore } from "../layer/LayerVisibilityStore";
import { AttributeDataStore } from "../layer/AttributeDataStore";
import { ToolStore } from "../layer/ToolStore";
import { MapStore } from "../map/MapStore";
import { MapToolStore } from "../map/MapToolStore";
import { SettingsStore } from "../settings/SettingsStore";
import { WidgetCatalogStore } from "../widget/WidgetCatalogStore";
import { WidgetOverlayStore } from "../widget/WidgetOverlayStore";
import { LocaleStore } from "../locale/LocaleStore";
import { coreTranslations } from "@core/framework/i18n";
import { LayerAdapterFactory } from "@core/domain/adapters/layer/LayerAdapterFactory";
import { AttributeAdapterFactory } from "@core/domain/adapters/attribute/AttributeAdapterFactory";
import { SourceAdapterFactory } from "@core/domain/adapters/source/SourceAdapterFactory";
import { LayerConfigRegistry } from "@core/domain/adapters";
import { logger } from "@core/shared/diagnostics/logger";
import { registerBuiltInWidgets } from "@widgets/registerWidgets";
import {
    registerLayerAdapters,
    registerAttributeAdapters,
} from "@core/domain/adapters";
import { registerModules } from "@modules/registerModules";
import { registerTools } from "@layer-tools/registerTools";
import { registerMapTools } from "@map-tools/registerMapTools";

export class RootStore {
    // Adapter factories — available before any store
    readonly layerAdapterFactory: LayerAdapterFactory;
    readonly attributeAdapterFactory: AttributeAdapterFactory;
    readonly sourceAdapterFactory: SourceAdapterFactory;
    readonly layerConfigRegistry: LayerConfigRegistry;

    readonly treeStore: LayerTreeStore;
    readonly visibilityStore: LayerVisibilityStore;
    readonly attributeDataStore: AttributeDataStore;
    readonly layerToolStore: ToolStore;
    readonly mapStore: MapStore;
    readonly mapToolStore: MapToolStore;
    readonly settingsStore: SettingsStore;
    readonly catalogStore: WidgetCatalogStore;
    readonly overlayStore: WidgetOverlayStore;
    readonly localeStore: LocaleStore;

    /** Tracks whether initializeApp has completed successfully */
    isInitialized = false;

    /** Error message from failed initialization */
    initError: string | null = null;

    constructor() {
        // Factories first — other stores may depend on them
        this.layerAdapterFactory = new LayerAdapterFactory();
        this.attributeAdapterFactory = new AttributeAdapterFactory();
        this.sourceAdapterFactory = new SourceAdapterFactory();
        this.layerConfigRegistry = new LayerConfigRegistry();

        // LocaleStore must be created early so other stores can use it
        this.localeStore = new LocaleStore();
        this.localeStore.registerTranslations("core", coreTranslations.core!);

        // SettingsStore must be created first as other stores may depend on it
        this.settingsStore = new SettingsStore(this);
        this.treeStore = new LayerTreeStore(this);
        this.visibilityStore = new LayerVisibilityStore(this);
        this.attributeDataStore = new AttributeDataStore(this);
        this.layerToolStore = new ToolStore(this);
        this.mapStore = new MapStore(this);
        this.mapToolStore = new MapToolStore(this);
        this.catalogStore = new WidgetCatalogStore(this);
        this.overlayStore = new WidgetOverlayStore(this);

        makeAutoObservable(this);
    }

    initialize = flow(function* (this: RootStore) {
        this.clearInitError();
        try {
            yield registerLayerAdapters(this);
            yield registerAttributeAdapters(this);
            yield registerBuiltInWidgets(this);
            yield registerTools(this);
            yield registerMapTools(this);
            yield registerModules(this);
            yield this.treeStore.fetchLayerTree();
            this.markInitialized();
        } catch (error) {
            logger.error("Failed to initialize app:", error);
            this.setInitError(error);
        }
    });

    markInitialized(): void {
        this.isInitialized = true;
    }

    setInitError(error: unknown): void {
        this.initError =
            error instanceof Error ? error.message : "Unknown error";
    }

    clearInitError(): void {
        this.initError = null;
    }
}
