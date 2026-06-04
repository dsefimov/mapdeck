import maplibregl from "maplibre-gl";
import { makeAutoObservable } from "mobx";
import { DeckOverlayManager } from "@core/domain/overlay";
import { LayerManager } from "@core/domain/managers/LayerManager";
import { logger } from "@core/shared/diagnostics/logger";
import { validateBbox, flattenTo2D, type Bbox } from "@core/shared/geo";
import { type RootStore } from "@core/framework/store";
import type { BaseMapConfig, MapContext } from "@core/framework/types";

const BASEMAP_LAYER_ID = "basemap";

export class MapStore {
    private map: maplibregl.Map | null = null;
    readonly overlayManager: DeckOverlayManager;
    private layerManager: LayerManager | null = null;
    private _basemapConfigs: BaseMapConfig[] = [];

    constructor(readonly rootStore: RootStore) {
        this.overlayManager = new DeckOverlayManager();
        makeAutoObservable(this, { rootStore: false });
    }

    /** Atomically returns map + overlayManager when the map is initialized */
    get context(): MapContext | null {
        return this.map
            ? { map: this.map, overlayManager: this.overlayManager }
            : null;
    }

    /** Get the current map instance */
    getMap(): maplibregl.Map | null {
        return this.map;
    }

    /**
     * Initialize a new maplibre-gl Map and attach it to the store.
     * Sets up deck.gl overlay, LayerManager, and notifies MapToolStore.
     * Call dispose() on unmount to clean up.
     */
    initializeMap(container: HTMLDivElement): void {
        const map = new maplibregl.Map({
            container,
            style: {
                version: 8,
                sources: {},
                layers: [],
            },
            center: [0, 0],
            zoom: 1,
        });

        this.setMap(map);
    }

    /**
     * Set the current map instance
     * @param map - Maplibre GL map instance
     */
    setMap(map: maplibregl.Map): void {
        if (this.map === map) {
            return;
        }

        if (this.layerManager) {
            this.layerManager.dispose();
            this.layerManager = null;
        }

        this.map = map;

        this.overlayManager.attachToMap(map);

        this.layerManager = new LayerManager(this.rootStore, {
            map,
            overlayManager: this.overlayManager,
        });
        this.layerManager.initialize();

        this.rootStore.mapToolStore.onMapChanged(map);
    }

    /**
     * Zoom the map to the specified bounding box.
     * Caller must ensure bbox is defined and meaningful.
     * @param bbox - Bounding box as [west, south, east, north] or [west, south, minZ, east, north, maxZ]
     */
    zoomToExtent(bbox: Bbox): void {
        if (!this.map) {
            logger.warn("Cannot zoom: map not available");
            return;
        }

        const validation = validateBbox(bbox);
        if (!validation.isValid) {
            logger.warn(`Cannot zoom: ${validation.error}`);
            return;
        }

        try {
            const bbox2D = flattenTo2D(bbox);
            this.map.fitBounds(bbox2D.bounds, {
                padding: { top: 20, bottom: 20, left: 20, right: 20 },
                maxZoom: 18,
                duration: 500,
            });
        } catch (error) {
            logger.error("Failed to zoom to extent:", error);
        }
    }

    /**
     * Register the full basemap config list (called once during app init).
     * Enables `availableBasemaps` and `activeBasemap` getters.
     */
    registerBasemapConfigs(configs: BaseMapConfig[]): void {
        this._basemapConfigs = configs;
    }

    /**
     * Basemaps filterable by the current setting options.
     * Falls back to the full registered list if no setting is registered.
     */
    get availableBasemaps(): BaseMapConfig[] {
        const setting =
            this.rootStore.settingsStore.getOwnerSettings("basemap")[0];
        if (!setting || setting.type !== "select" || !setting.options) {
            return this._basemapConfigs;
        }
        const optionIds = new Set(setting.options.map((o) => o.value));
        return this._basemapConfigs.filter((bm) => optionIds.has(bm.id));
    }

    /** Currently active basemap config, resolved from the setting. */
    get activeBasemap(): BaseMapConfig | undefined {
        const id =
            this.rootStore.settingsStore.getStringSetting("basemap.basemap");
        if (!id) return undefined;
        return this._basemapConfigs.find((bm) => bm.id === id);
    }

    /** Switch the active basemap setting. */
    setActiveBasemap(basemapId: string): void {
        this.rootStore.settingsStore.setSetting("basemap.basemap", basemapId);
    }

    /**
     * Apply a basemap config directly to the maplibre map.
     * Replaces any existing basemap source/layer.
     */
    applyBasemapToMap(basemap: BaseMapConfig): void {
        if (!this.map) return;

        if (this.map.getSource(BASEMAP_LAYER_ID)) {
            this.map.removeLayer(BASEMAP_LAYER_ID);
            this.map.removeSource(BASEMAP_LAYER_ID);
        }

        const source: maplibregl.RasterSourceSpecification = {
            type: "raster",
            tiles: [basemap.url],
            tileSize: 256,
            attribution: basemap.attribution || "",
            minzoom: basemap.minZoom || 0,
            maxzoom: basemap.maxZoom || 22,
        };

        const style = this.map.getStyle();
        const layerIds = style.layers?.map((l) => l.id) || [];

        let beforeId: string | undefined;
        for (const layerId of layerIds) {
            if (layerId !== BASEMAP_LAYER_ID) {
                beforeId = layerId;
                break;
            }
        }

        this.map.addSource(BASEMAP_LAYER_ID, source);
        this.map.addLayer(
            {
                id: BASEMAP_LAYER_ID,
                type: "raster",
                source: BASEMAP_LAYER_ID,
            },
            beforeId,
        );
    }

    dispose(): void {
        this.overlayManager.detachFromMap();

        if (this.layerManager) {
            this.layerManager.dispose();
            this.layerManager = null;
        }

        this.map?.remove();
        this.map = null;
    }
}
