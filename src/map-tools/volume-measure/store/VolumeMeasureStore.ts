/**
 * Store for volume-measure tool.
 *
 * Extends MeasureToolStore with volume-specific fields:
 * boundary completion state and inside-point data.
 *
 * Unlike Ruler3D/AreaMeasure, volume-measure is a two-phase tool:
 * draw boundary polygon → complete → compute volume from cloud points.
 * Inherited editMode/draggingIndex are unused but harmless.
 */
import { makeObservable, observable, action } from "mobx";
import type { MeasurementPoint3D } from "@core/framework/types";
import { MeasureToolStore } from "@map-tools/shared/MeasureToolStore";

export class VolumeMeasureStore extends MeasureToolStore {
    /** Whether the boundary polygon has been closed */
    isComplete = false;

    /** Points inside the boundary used for volume calculation */
    insidePoints: MeasurementPoint3D[] = [];

    constructor() {
        super();
        // Declare only fields unique to this class.
        // Inherited fields (points, previewPoint, etc.) and their actions
        // are already annotated by the parent's makeObservable.
        makeObservable(this, {
            isComplete: observable,
            insidePoints: observable.ref,
            completeBoundary: action,
            setInsidePoints: action,
        });
        // boundary getter — MobX tracks through this.points automatically.
        // addBoundaryPoint — delegates to addPoint (already an action).
        // reset — annotated by parent; override inherits action semantics.
    }

    /** Alias for points — volume nomenclature for the boundary polygon */
    get boundary(): MeasurementPoint3D[] {
        return this.points;
    }

    /** Alias for addPoint */
    addBoundaryPoint(point: MeasurementPoint3D): void {
        this.addPoint(point);
    }

    completeBoundary(): void {
        this.isComplete = true;
        this.previewPoint = null;
    }

    setInsidePoints(points: MeasurementPoint3D[]): void {
        this.insidePoints = points;
    }

    override reset(): void {
        super.reset();
        this.isComplete = false;
        this.insidePoints = [];
    }
}
