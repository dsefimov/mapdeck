import type { Layer, PickingInfo } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type maplibregl from "maplibre-gl";
import { logger } from "@core/shared/diagnostics/logger";
import { perfTracker } from "@core/shared/diagnostics/PerfTracker";
import type { OverlayManager as IOverlayManager } from "@core/framework/types";
import type { ManagedLayer, TypedOverlay, PickParams } from "./overlayTypes";

export class DeckOverlayManager implements IOverlayManager<Layer> {
    private overlay: TypedOverlay | null = null;
    private map: maplibregl.Map | null = null;
    private layers = new Map<string, ManagedLayer>();
    private _updatePending = false;

    constructor() {}

    attachToMap(map: maplibregl.Map): void {
        if (this.map === map) {
            return;
        }

        this.detachFromMap();

        this.map = map;
        this.overlay = new MapboxOverlay({
            layers: this.getActiveLayers(),
            interleaved: true,
        }) as TypedOverlay;

        map.addControl(this.overlay);
    }

    detachFromMap(): void {
        if (this.map && this.overlay) {
            this.map.removeControl(this.overlay);
            this.overlay = null;
            this.map = null;
        }
    }

    addLayer(layerId: string, layer: Layer): void {
        if (this.layers.has(layerId)) {
            logger.warn(
                `OverlayManager: Layer "${layerId}" already exists, overwriting`,
            );
            this.removeLayer(layerId);
        }

        this.layers.set(layerId, {
            id: layerId,
            layer,
            visible: true,
        });

        this.updateOverlayLayers();
    }

    removeLayer(layerId: string): boolean {
        const removed = this.layers.delete(layerId);
        if (removed) {
            this.updateOverlayLayers();
        }
        return removed;
    }

    updateLayer(layerId: string, props: Partial<Layer>): boolean {
        const managedLayer = this.layers.get(layerId);
        if (!managedLayer) {
            logger.warn(
                `OverlayManager: Cannot update non-existent layer "${layerId}"`,
            );
            return false;
        }

        const updatedLayer = managedLayer.layer.clone(props);

        this.layers.set(layerId, {
            ...managedLayer,
            layer: updatedLayer,
        });

        this.updateOverlayLayers();
        return true;
    }

    setLayerVisibility(layerId: string, visible: boolean): boolean {
        const managedLayer = this.layers.get(layerId);
        if (!managedLayer) {
            return false;
        }

        if (managedLayer.visible === visible) {
            return true;
        }

        this.layers.set(layerId, {
            ...managedLayer,
            visible,
        });

        this.updateOverlayLayers();
        return true;
    }

    getActiveLayers(): Layer[] {
        return Array.from(this.layers.values())
            .filter((managedLayer) => managedLayer.visible)
            .map((managedLayer) => managedLayer.layer);
    }

    private updateOverlayLayers(): void {
        if (!this.overlay) return;
        if (this._updatePending) return;

        this._updatePending = true;
        Promise.resolve().then(() => {
            this._updatePending = false;
            if (this.overlay) {
                perfTracker.start("overlay.setProps");
                const activeLayers = this.getActiveLayers();
                this.overlay.setProps({ layers: activeLayers });
                perfTracker.end("overlay.setProps");
            }
        });
    }

    isAttached(): boolean {
        return this.overlay !== null && this.map !== null;
    }

    getMap(): maplibregl.Map | null {
        return this.map;
    }

    getOverlay(): TypedOverlay | null {
        return this.overlay;
    }

    pickObject(x: number, y: number, radius?: number): PickingInfo | null {
        if (!this.map || !this.overlay) {
            return null;
        }

        const params: PickParams =
            radius !== undefined ? { x, y, radius } : { x, y };

        try {
            return this.overlay.pickObject(params);
        } catch (error) {
            logger.error("OverlayManager: pickObject failed", error);
            return null;
        }
    }

    pickObjects(x: number, y: number, radius?: number): PickingInfo[] {
        if (!this.map || !this.overlay) {
            return [];
        }

        const params: PickParams =
            radius !== undefined ? { x, y, radius } : { x, y };

        try {
            return this.overlay.pickObjects(params);
        } catch (error) {
            logger.error("OverlayManager: pickObjects failed", error);
            return [];
        }
    }

    dispose(): void {
        this.detachFromMap();
        this.layers.clear();
    }
}
