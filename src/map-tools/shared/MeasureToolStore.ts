/**
 * Base MobX store for measurement tools.
 *
 * Holds shared observable state (points, preview, edit/drag mode)
 * and actions used by Ruler3D, AreaMeasure, and VolumeMeasure.
 *
 * VolumeMeasureStore extends this class with volume-specific fields.
 */
import { makeObservable, observable, action } from "mobx";
import type { MeasurementPoint3D } from "@core/framework/types";

export class MeasureToolStore {
    /** Ordered list of measured points (open polyline for ruler/area) */
    points: MeasurementPoint3D[] = [];

    /** Point under the cursor (for preview rendering) */
    previewPoint: MeasurementPoint3D | null = null;

    /** Whether the tool is in point-drag-edit mode */
    editMode = false;

    /** Index of the point currently being dragged, or null */
    draggingIndex: number | null = null;

    constructor() {
        makeObservable<this, "points">(this, {
            points: observable.shallow,
            previewPoint: observable.ref,
            editMode: observable,
            draggingIndex: observable,
            addPoint: action,
            removeLastPoint: action,
            clearPoints: action,
            setPreviewPoint: action,
            toggleEditMode: action,
            startDrag: action,
            replacePoint: action,
            endDrag: action,
            exitEditMode: action,
            reset: action,
        });
    }

    // ---- Actions ----

    addPoint(point: MeasurementPoint3D): void {
        this.points = [...this.points, point];
    }

    removeLastPoint(): void {
        this.points = this.points.slice(0, -1);
    }

    clearPoints(): void {
        this.points = [];
        this.previewPoint = null;
        this.editMode = false;
        this.draggingIndex = null;
    }

    setPreviewPoint(point: MeasurementPoint3D | null): void {
        this.previewPoint = point;
    }

    toggleEditMode(): void {
        this.editMode = !this.editMode;
        this.previewPoint = null;
        if (!this.editMode) {
            this.draggingIndex = null;
        }
    }

    startDrag(index: number): void {
        this.draggingIndex = index;
    }

    replacePoint(index: number, point: MeasurementPoint3D): void {
        this.points = this.points.map((p, i) => (i === index ? point : p));
    }

    endDrag(): void {
        this.draggingIndex = null;
    }

    /** Exit edit mode and end any drag operation */
    exitEditMode(): void {
        this.editMode = false;
        this.draggingIndex = null;
    }

    /** Reset all state (called on tool activate) */
    reset(): void {
        this.clearPoints();
    }
}
