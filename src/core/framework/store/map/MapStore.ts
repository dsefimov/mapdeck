import maplibregl from "maplibre-gl";
import { makeAutoObservable } from "mobx";
import { DeckOverlayManager } from "@core/domain/overlay";
import { LayerManager } from "@core/domain/managers/LayerManager";
import { logger } from "@core/shared/diagnostics/logger";
import { validateBbox, flattenTo2D, type Bbox } from "@core/shared/geo";
import { type RootStore } from "@core/framework/store";
import type { MapContext } from "@core/framework/types";

export class MapStore {
    private map: maplibregl.Map | null = null;
    readonly overlayManager: DeckOverlayManager;
    private layerManager: LayerManager | null = null;

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

        // Attach deck.gl overlay for point cloud rendering
        this.overlayManager.attachToMap(map);

        this.layerManager = new LayerManager(this.rootStore, {
            map,
            overlayManager: this.overlayManager,
        });
        this.layerManager.initialize();

        // Notify MapToolStore about the map change
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
                duration: 500,
            });
        } catch (error) {
            logger.error("Failed to zoom to extent:", error);
        }
    }

    dispose(): void {
        // Detach deck.gl overlay
        this.overlayManager.detachFromMap();

        if (this.layerManager) {
            this.layerManager.dispose();
            this.layerManager = null;
        }

        // Properly remove the maplibre instance from DOM
        this.map?.remove();
        this.map = null;
    }
}
