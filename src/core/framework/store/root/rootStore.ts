import { makeAutoObservable } from "mobx";
import type { LayoutItem } from "react-grid-layout";
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
import { DeckOverlayManager } from "@core/domain/overlay";

export class RootStore {
    // Adapter factories — available before any store
    readonly layerAdapterFactory: LayerAdapterFactory;
    readonly attributeAdapterFactory: AttributeAdapterFactory;
    readonly sourceAdapterFactory: SourceAdapterFactory;
    readonly overlayManager: DeckOverlayManager;

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
        this.overlayManager = new DeckOverlayManager();

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

    /**
     * Sync layout from UI changes (to be called from react-grid-layout onLayoutChange)
     */
    syncLayout(layoutItems: LayoutItem[]): void {
        layoutItems.forEach((item) => {
            const widget = this.overlayStore.getOpenWidget(item.i);
            if (widget) {
                this.overlayStore.updateLayout(item.i, {
                    ...widget.layout,
                    x: item.x,
                    y: item.y,
                    w: item.w,
                    h: item.h,
                });
            }
        });
    }

    /**
     * Update single widget layout (for edge snapping scenarios)
     */
    updateWidgetLayout(widgetId: string, layout: LayoutItem): void {
        this.overlayStore.updateLayout(widgetId, layout);
    }

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
