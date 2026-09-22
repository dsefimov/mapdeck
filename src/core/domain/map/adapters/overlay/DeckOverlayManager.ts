import { MapView } from "@deck.gl/core";
import type { Layer, PickingInfo, Viewport } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapboxOverlayProps } from "@deck.gl/mapbox";
import type maplibregl from "maplibre-gl";
import { logger } from "@core/lib/logger";
import type { FrustumPlane, FrustumPlanes } from "@core/lib/geo";
import type { OverlayManager as IOverlayManager } from "@core/contracts";
import { buildMapViewState } from "../../logic/viewportState";
import type { ManagedLayer, TypedOverlay, PickParams } from "./overlayTypes";

/** The plane shape deck.gl hands out, derived from its own viewport signature. */
type DeckFrustumPlane = ReturnType<Viewport["getFrustumPlanes"]>["near"];

/**
 * Narrow a deck.gl plane to the kernel's representation.
 *
 * deck.gl carries the normal as a math.gl Vector3, an Array subclass whose
 * length is not fixed at the type level, and names it in a package that is
 * only a transitive dependency here. The kernel keeps a three-component tuple
 * instead, so the culling math can destructure it without index checks.
 *
 * Converting rather than casting also guards against drift: if deck.gl
 * reshapes its plane, the compiler fails on this function instead of letting
 * a cast paper over the difference.
 */
function toFrustumPlane(plane: DeckFrustumPlane): FrustumPlane {
    const [x = 0, y = 0, z = 0] = plane.normal;
    return { distance: plane.distance, normal: [x, y, z] };
}

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
        // The cast: MapboxOverlayProps does not declare the `views` field,
        // but deck.gl's MapboxOverlay forwards it to the MapView it owns —
        // passing a custom MapView({fovy}) matching the host map's vertical
        // FOV is exactly the supported configuration. Typed via the cast
        // because the prop type lags the runtime contract.
        const overlayProps = {
            layers: this.getActiveLayers(),
            interleaved: true,
            views: [
                new MapView({
                    id: "mapbox",
                    fovy: map.getVerticalFieldOfView(),
                }),
            ],
        } as unknown as MapboxOverlayProps;
        this.overlay = new MapboxOverlay(overlayProps) as TypedOverlay;

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
                const activeLayers = this.getActiveLayers();
                this.overlay.setProps({ layers: activeLayers });
            }
        });
    }

    isAttached(): boolean {
        return this.overlay !== null && this.map !== null;
    }

    getMap(): maplibregl.Map | null {
        return this.map;
    }

    /**
     * Build the deck.gl viewport for the attached map camera.
     * Reconstructs the viewport from public MapLibre state instead of reaching
     * into the overlay's private Deck instance — MapboxOverlay derives its
     * interleaved viewport from the map camera the same way.
     */
    private getViewport(): Viewport | null {
        const map = this.map;
        if (!map) return null;

        const canvas = map.getCanvas();
        const width = canvas.clientWidth ?? canvas.width;
        const height = canvas.clientHeight ?? canvas.height;
        if (!width || !height) return null;

        const view = new MapView({
            id: "mapbox",
            fovy: map.getVerticalFieldOfView(),
        });
        return view.makeViewport({
            width,
            height,
            viewState: buildMapViewState(map),
        });
    }

    /**
     * Get camera position [lng, lat, altitude] from the map viewport.
     * Returns null if the overlay is not attached to a sized map.
     */
    getCameraPosition(): [number, number, number] | null {
        const vp = this.getViewport();
        if (!vp) return null;
        return vp.unprojectPosition(vp.cameraPosition);
    }

    /**
     * Get the active deck.gl Viewport. Exposes the raw Viewport instance
     * for coordinate projection (projectPosition) and center-offset access.
     * Returns null if the overlay is not attached to a sized map.
     */
    getActiveViewport(): Viewport | null {
        return this.getViewport();
    }

    /**
     * Get frustum planes from the map viewport for 3D AABB culling.
     * Returns null if the overlay is not attached to a sized map.
     */
    getFrustumPlanes(): FrustumPlanes | null {
        const vp = this.getViewport();
        if (!vp) return null;
        const planes = vp.getFrustumPlanes();
        return {
            near: toFrustumPlane(planes.near),
            far: toFrustumPlane(planes.far),
            left: toFrustumPlane(planes.left),
            right: toFrustumPlane(planes.right),
            top: toFrustumPlane(planes.top),
            bottom: toFrustumPlane(planes.bottom),
        };
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
