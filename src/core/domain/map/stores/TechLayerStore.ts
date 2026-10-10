import { makeAutoObservable } from "mobx";
import type { GeoPoint } from "@core/lib/geo";
import type { Geometry, GeometryKind } from "../types";

/**
 * Editable store for a technical layer: a collection of geometries drawn
 * over the map and one in-progress drawing.
 *
 * Pure state container — no deck.gl, no theme, no map access. Rendering is
 * `renderTechLayers(spec, colors)` at the overlay adapter seam; each tool
 * owns its instance via the instance-state container.
 */
export class TechLayerStore {
    /** Completed geometries (the layer content). */
    geometries: Geometry[] = [];
    /** The in-progress geometry being drawn. */
    drawing: Geometry | null = null;
    /** Cursor preview point. */
    previewPoint: GeoPoint | null = null;
    /** Whether the drawing is in node-edit mode. */
    editMode = false;
    /** Index of the drawing node currently being dragged, or null. */
    draggingIndex: number | null = null;

    private _nextGeometryId = 1;

    constructor() {
        makeAutoObservable<this, "_nextGeometryId">(this, {
            _nextGeometryId: false,
        });
    }

    // === Drawing ===

    /** Start drawing a new geometry of the given kind. */
    startDrawing(kind: GeometryKind): void {
        this.drawing = {
            id: `g${this._nextGeometryId++}`,
            kind,
            points: [],
        };
    }

    /** Append a point to the in-progress drawing. */
    addPoint(point: GeoPoint): void {
        if (!this.drawing) return;
        this.drawing = {
            ...this.drawing,
            points: [...this.drawing.points, point],
        };
    }

    /** Remove the last point of the in-progress drawing. */
    removeLastPoint(): void {
        if (!this.drawing) return;
        this.drawing = {
            ...this.drawing,
            points: this.drawing.points.slice(0, -1),
        };
    }

    /** Move the in-progress drawing into the completed geometries. */
    commitDrawing(): void {
        if (!this.drawing) return;
        this.geometries = [...this.geometries, this.drawing];
        this.drawing = null;
    }

    // === Collection editing ===

    /** Remove a completed geometry by id. */
    removeGeometry(id: string): void {
        this.geometries = this.geometries.filter((g) => g.id !== id);
    }

    /** Move the node at `nodeIndex` of the geometry `geometryId` to `point`. */
    moveNode(geometryId: string, nodeIndex: number, point: GeoPoint): void {
        const update = (g: Geometry): Geometry =>
            g.id === geometryId
                ? {
                      ...g,
                      points: g.points.map((p, i) =>
                          i === nodeIndex ? point : p,
                      ),
                  }
                : g;
        this.geometries = this.geometries.map(update);
        if (this.drawing?.id === geometryId) {
            this.drawing = update(this.drawing);
        }
    }

    /** Set the cursor preview point (null to clear). */
    setPreviewPoint(point: GeoPoint | null): void {
        this.previewPoint = point;
    }

    // === Node editing ===

    /** Toggle node-edit mode (dragging existing drawing nodes). */
    toggleEditMode(): void {
        this.editMode = !this.editMode;
        this.previewPoint = null;
        if (!this.editMode) {
            this.draggingIndex = null;
        }
    }

    /** Begin dragging the drawing node at `index`. */
    startDrag(index: number): void {
        this.draggingIndex = index;
    }

    /** End the current drag. */
    endDrag(): void {
        this.draggingIndex = null;
    }

    /** Exit edit mode and end any drag. */
    exitEditMode(): void {
        this.editMode = false;
        this.draggingIndex = null;
    }

    /** Reset all state (geometries, drawing, preview, edit mode). */
    reset(): void {
        this.geometries = [];
        this.drawing = null;
        this.previewPoint = null;
        this.editMode = false;
        this.draggingIndex = null;
    }
}
