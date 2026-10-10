import type maplibregl from "maplibre-gl";
import type { Layer } from "@deck.gl/core";
import type {
    OverlayManager,
    PointCloudData,
    ProtocolRegistry,
} from "@core/contracts";
import { pickPointFromCloud, toPointCloudDataAdapter } from "@core/contracts";
import type { TechLayerStore } from "@core/domain/map";
import type { GeoPoint } from "@core/lib/geo";
import {
    MapInteractionController,
    isMiddleClick,
    type MapHandlerBinding,
} from "@map-tools/shared/MapInteractionController";
import { calculateTinPrismVolume } from "./logic/volume-engine";
import {
    buildTopSurfacePolygons,
    extractPointsFromCloudData,
    filterPointsInsidePolygon,
    MAX_VOLUME_CLOUD_POINTS,
    thinPoints,
} from "./logic/volume";
import { VolumeMeasureState } from "./logic/volumeState";

/** Overlay layer id prefix owned by the volume tool. */
export const VOLUME_LAYER_PREFIX = "volume-measure";

/** Everything the volume controller needs from the panel's environment. */
export interface VolumeAttachDeps {
    readonly map: maplibregl.Map;
    readonly overlayManager: OverlayManager<Layer>;
    readonly getPointCloudData: (layerId: string) => PointCloudData | undefined;
    readonly protocols: ProtocolRegistry;
    readonly onEscape: () => void;
}

/**
 * Interaction and pipeline orchestration of the volume measure tool:
 * cloud-point drawing, the drawing → complete phase machine, and the cached
 * computation pipeline (inside-points filter, grid+trapezoid volume,
 * top-surface mesh). State lives in TechLayerStore (geometry) and
 * VolumeMeasureState (phase + results) — both instance-state.
 */
export class VolumeMeasureController extends MapInteractionController<VolumeAttachDeps> {
    readonly volume = new VolumeMeasureState();

    constructor(readonly store: TechLayerStore) {
        super();
    }

    protected mapHandlers(): ReadonlyArray<MapHandlerBinding> {
        return [
            { event: "click", listener: this.handleMapClick },
            { event: "mousemove", listener: this.handleMapMouseMove },
            { event: "mousedown", listener: this.handleMiddleClick },
        ];
    }

    protected override onAttached(): void {
        if (!this.store.drawing && !this.volume.isComplete) {
            this.store.startDrawing("polygon");
        }
    }

    /** The polygon being measured: the active drawing or the last geometry. */
    get boundary(): GeoPoint[] {
        return (
            this.store.drawing?.points ??
            this.store.geometries[this.store.geometries.length - 1]?.points ??
            []
        );
    }

    /**
     * Commits the boundary and runs the computation pipeline. A boundary
     * with fewer than three points returns to the drawing phase with no
     * results.
     */
    completeBoundary(): void {
        this.store.commitDrawing();
        this.volume.markComplete();
        this.runPipeline();
    }

    /** Escape on a completed measurement starts over; otherwise closes the tool. */
    resetOrEscape(): void {
        if (this.volume.isComplete) {
            this.volume.resetToDrawing();
        } else {
            this.deps?.onEscape();
        }
    }

    /** Full reset: results discarded, geometry cleared, drawing restarted. */
    reset(): void {
        this.volume.resetToDrawing();
        this.store.reset();
        this.store.startDrawing("polygon");
    }

    private runPipeline(): void {
        const volume = this.volume;
        const boundary = this.boundary;
        if (!volume.isComplete || boundary.length < 3) {
            volume.clearResults();
            return;
        }

        if (volume.insidePoints.points.length === 0) {
            const allPoints = this.getAllLoadedCloudPoints();
            const filtered = filterPointsInsidePolygon(boundary, allPoints);
            volume.setInsidePoints(thinPoints(filtered, MAX_VOLUME_CLOUD_POINTS));
        }

        const insidePoints = volume.insidePoints.points;
        if (insidePoints.length >= 3 && volume.measurements === null) {
            volume.setMeasurements({
                ...calculateTinPrismVolume(boundary, insidePoints),
                cloudPointCount: insidePoints.length,
            });
        }

        if (insidePoints.length >= 3 && volume.topSurface === null) {
            volume.setTopSurface(
                buildTopSurfacePolygons(insidePoints, boundary),
            );
        }
    }

    private getAllLoadedCloudPoints(): GeoPoint[] {
        const protocols = this.deps?.protocols;
        const allPoints: GeoPoint[] = [];
        if (!protocols) return allPoints;
        for (const protocol of protocols.getAll()) {
            const adapter = toPointCloudDataAdapter(protocol.getLayerAdapter());
            if (!adapter) continue;
            for (const data of adapter.getAllLoadedData()) {
                for (const pt of extractPointsFromCloudData(data)) {
                    allPoints.push(pt);
                }
            }
        }
        return allPoints;
    }

    private handleMapClick = (event: maplibregl.MapMouseEvent): void => {
        const deps = this.deps;
        if (!deps || this.volume.isComplete) return;
        const point = pickPointFromCloud({
            screenX: event.point.x,
            screenY: event.point.y,
            getPointCloudData: deps.getPointCloudData,
            overlayManager: deps.overlayManager,
            excludeLayerPrefix: VOLUME_LAYER_PREFIX,
        });
        if (point) this.store.addPoint(point);
    };

    private handleMapMouseMove = (event: maplibregl.MapMouseEvent): void => {
        const deps = this.deps;
        if (!deps || this.volume.isComplete) return;
        const point = pickPointFromCloud({
            screenX: event.point.x,
            screenY: event.point.y,
            getPointCloudData: deps.getPointCloudData,
            overlayManager: deps.overlayManager,
            excludeLayerPrefix: VOLUME_LAYER_PREFIX,
        });
        this.store.setPreviewPoint(point);
    };

    private handleMiddleClick = (event: maplibregl.MapMouseEvent): void => {
        if (isMiddleClick(event)) {
            event.preventDefault();
            if (
                !this.volume.isComplete &&
                (this.store.drawing?.points.length ?? 0) >= 3
            ) {
                this.completeBoundary();
            }
        }
    };

    protected handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            this.resetOrEscape();
        } else if (event.key === "Enter" && !this.volume.isComplete) {
            event.preventDefault();
            this.completeBoundary();
        }
    };
}
