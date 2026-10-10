import maplibregl from "maplibre-gl";
import { makeAutoObservable } from "mobx";
import { DeckOverlayManager } from "../adapters/overlay";
import { LayerManager } from "../adapters/LayerManager";
import { prefixStyleFragment } from "../logic/prefixStyleFragment";
import { registerPmtilesProtocol } from "../pmtilesProtocol";
import { logger } from "@core/lib/logger";
import { validateBbox, flattenTo2D, type Bbox } from "@core/lib/geo";
import type { StoreRegistry } from "@core/store-registry";
import type { MapContext } from "@core/contracts";

/** Camera start before any layer asks to zoom somewhere. */
const INITIAL_CENTER: [number, number] = [0, 0];
const INITIAL_ZOOM = 1;

/** Keep a fitted extent off the viewport edges and below street-level detail. */
const FIT_BOUNDS_PADDING_PX = 20;
const FIT_BOUNDS_MAX_ZOOM = 18;
const FIT_BOUNDS_DURATION_MS = 500;

export class MapStore {
    private map: maplibregl.Map | null = null;
    readonly overlayManager: DeckOverlayManager;
    private layerManager: LayerManager | null = null;

    constructor(readonly rootStore: StoreRegistry) {
        this.overlayManager = new DeckOverlayManager();
        makeAutoObservable(this, { rootStore: false });
    }

    /** Atomically returns map + overlayManager when the map is initialized */
    get context(): MapContext | null {
        return this.map ? this.buildContext(this.map) : null;
    }

    /** The context surface adapters see: one assembly point, two callers. */
    private buildContext(map: maplibregl.Map): MapContext {
        return {
            map,
            overlayManager: this.overlayManager,
            reportLayerError: (layerId, error) =>
                this.layerManager?.handleLayerError(layerId, error),
            getCameraPosition: () => this.overlayManager.getCameraPosition(),
            getActiveViewport: () => this.overlayManager.getActiveViewport(),
            getFrustumPlanes: () => this.overlayManager.getFrustumPlanes(),
        };
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
        registerPmtilesProtocol();
        const map = new maplibregl.Map({
            container,
            style: {
                version: 8,
                sources: {},
                layers: [],
            },
            center: INITIAL_CENTER,
            zoom: INITIAL_ZOOM,
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

        this.layerManager = new LayerManager(
            {
                snapshot: this.rootStore.treeStore,
                errors: this.rootStore.treeStore,
                protocols: this.rootStore.protocolRegistry,
            },
            this.buildContext(map),
        );
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
                padding: FIT_BOUNDS_PADDING_PX,
                maxZoom: FIT_BOUNDS_MAX_ZOOM,
                duration: FIT_BOUNDS_DURATION_MS,
            });
        } catch (error) {
            logger.error("Failed to zoom to extent:", error);
        }
    }

    /**
     * Apply a style fragment to the map: the fragment is made
     * owner-prefixed and page-absolute by the pure transform, this store
     * only issues the map calls. Tracks owned IDs in the caller's Set.
     */
    applyStyleFragment(
        style: Partial<maplibregl.StyleSpecification>,
        prefix: string,
        ownedIds: Set<string>,
    ): void {
        if (!this.map) return;

        const fragment = prefixStyleFragment(
            style,
            prefix,
            window.location.origin,
        );

        for (const [srcId, srcSpec] of Object.entries(fragment.sources)) {
            this.map.addSource(srcId, srcSpec);
            ownedIds.add(srcId);
        }

        const beforeId = this._findBeforeId(this.map, prefix);
        for (const layer of fragment.layers) {
            this.map.addLayer(layer, beforeId);
            ownedIds.add(layer.id);
        }

        if (fragment.sprite) {
            this.map.setSprite(fragment.sprite);
        }

        if (style.glyphs) {
            this.map.setGlyphs(style.glyphs as string);
        }
    }

    /**
     * Remove layers then sources for the given set of owned IDs.
     * Safe to call on IDs that don't exist on the map.
     */
    removeOwnedLayers(ownedIds: Set<string>): void {
        if (!this.map) return;

        for (const id of ownedIds) {
            if (this.map.getLayer(id)) {
                try {
                    this.map.removeLayer(id);
                } catch {
                    // Layer may have been removed externally
                }
            }
        }

        for (const id of ownedIds) {
            if (this.map.getSource(id)) {
                try {
                    this.map.removeSource(id);
                } catch {
                    // Source may have been removed externally
                }
            }
        }
    }

    /** Find the insertion point: first non-prefixed layer in the stack. */
    private _findBeforeId(
        map: maplibregl.Map,
        prefix: string,
    ): string | undefined {
        const style = map.getStyle();
        const ids = style.layers?.map((l) => l.id) ?? [];
        for (const id of ids) {
            if (!id.startsWith(prefix)) return id;
        }
        return undefined;
    }

    /** Reverses the construction sequence: manager, overlay, map. */
    dispose(): void {
        if (this.layerManager) {
            this.layerManager.dispose();
            this.layerManager = null;
        }

        this.overlayManager.detachFromMap();

        this.map?.remove();
        this.map = null;
    }
}
