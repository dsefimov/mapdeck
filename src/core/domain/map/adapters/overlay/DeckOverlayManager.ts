import { MapView } from "@deck.gl/core";
import type { Layer, PickingInfo, Viewport } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapboxOverlayProps } from "@deck.gl/mapbox";
import type maplibregl from "maplibre-gl";
import { logger } from "@core/lib/logger";
import type { FrustumPlane, FrustumPlanes } from "@core/lib/geo";
import type {
    OverlayManager as IOverlayManager,
    PointPickingCamera,
} from "@core/contracts";
import { buildMapViewState, translatedPlaneDistance } from "../../logic/viewportState";
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
     * The terrain camera's offset from this flat viewport's camera, in the
     * flat viewport's common space.
     *
     * MapLibre's terrain camera is the flat (sea-level) camera translated
     * vertically by the elevation under the view center — its transform
     * applies a plain "elevate camera over terrain" translation and keeps
     * the look direction. Visibility consumers of this viewport (COPC
     * frustum culling, SSE distances) misjudge everything in view once that
     * elevation is comparable to the camera altitude, so the camera position
     * and frustum planes must shift by it. `queryTerrainElevation` reports
     * the same exaggeration-multiplied value MapLibre's transform uses.
     *
     * Null when terrain is off or the elevation is not a usable number:
     * MapLibre returns null without terrain and 0 while the DEM under the
     * center is not loaded (its transform then also sits at 0) — the flat
     * camera is already correct in both cases. Computed per accessor call:
     * the elevation refines as DEM tiles load under a resting camera, and
     * consumers re-read on their viewport-change events.
     */
    private terrainCameraOffset(
        map: maplibregl.Map,
        flat: Viewport,
    ): [number, number, number] | null {
        if (!map.getTerrain()) {
            return null;
        }
        const elevation = map.queryTerrainElevation(map.getCenter());
        if (elevation === null || !Number.isFinite(elevation)) {
            return null;
        }
        if (elevation === 0) {
            return null;
        }
        const { lng, lat } = map.getCenter();
        // projectPosition is linear in altitude at a fixed lng/lat, so the
        // difference is the common-space world-up direction, per meter.
        const zero = flat.projectPosition([lng, lat, 0]);
        const up = flat.projectPosition([lng, lat, 1]);
        return [
            (up[0] - zero[0]) * elevation,
            (up[1] - zero[1]) * elevation,
            (up[2] - zero[2]) * elevation,
        ];
    }

    /**
     * Get camera position [lng, lat, altitude] from the map viewport,
     * translated to the real terrain-anchored camera when terrain is on.
     * Returns null if the overlay is not attached to a sized map.
     */
    getCameraPosition(): [number, number, number] | null {
        const vp = this.getViewport();
        if (!vp || !this.map) return null;

        const [cx = 0, cy = 0, cz = 0] = vp.cameraPosition;
        const offset = this.terrainCameraOffset(this.map, vp);
        if (!offset) {
            return vp.unprojectPosition([cx, cy, cz]);
        }
        return vp.unprojectPosition([
            cx + offset[0],
            cy + offset[1],
            cz + offset[2],
        ]);
    }

    /**
     * Get the active deck.gl Viewport. Exposes the raw Viewport instance
     * for coordinate projection (projectPosition) and center-offset access.
     * Returns null if the overlay is not attached to a sized map.
     *
     * The flat sea-level viewport by design: the terrain camera is a pure
     * translation of it (see {@link terrainCameraOffset}), so projections
     * stay in one common space and only the camera position and frustum
     * planes carry the translation.
     */
    getActiveViewport(): Viewport | null {
        return this.getViewport();
    }

    /**
     * Get frustum planes for 3D AABB culling, translated to the real
     * terrain-anchored camera when terrain is on.
     * Returns null if the overlay is not attached to a sized map.
     */
    getFrustumPlanes(): FrustumPlanes | null {
        const vp = this.getViewport();
        if (!vp || !this.map) return null;
        const planes = vp.getFrustumPlanes();
        const offset = this.terrainCameraOffset(this.map, vp);
        const toPlane = offset
            ? (plane: DeckFrustumPlane): FrustumPlane => ({
                  normal: toFrustumPlane(plane).normal,
                  distance: translatedPlaneDistance(
                      plane.distance,
                      plane.normal,
                      offset,
                  ),
              })
            : toFrustumPlane;
        return {
            near: toPlane(planes.near),
            far: toPlane(planes.far),
            left: toPlane(planes.left),
            right: toPlane(planes.right),
            top: toPlane(planes.top),
            bottom: toPlane(planes.bottom),
        };
    }

    getPickCamera(): PointPickingCamera | null {
        const viewport = this.getViewport();
        if (!viewport) return null;
        return {
            // deck types cameraPosition as number[]; it is always [x, y, z].
            cameraPosition: viewport.cameraPosition as [number, number, number],
            projectPosition: (coords) => viewport.projectPosition(coords),
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
