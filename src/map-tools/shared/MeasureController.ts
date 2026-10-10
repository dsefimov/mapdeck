import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import type { Layer } from "@deck.gl/core";
import type { OverlayManager } from "@core/contracts/domain/map-context";
import type { PointCloudData } from "@core/contracts";
import { getPointWithFallback } from "@core/contracts";

import type { TechLayerStore, GeometryKind } from "@core/domain/map";
import {
    MapInteractionController,
    isMiddleClick,
    type MapHandlerBinding,
} from "./MapInteractionController";

/** Hit-testing slack around a cursor when grabbing a drawing node in edit mode. */
const EDIT_NODE_PICK_RADIUS_PX = 10;

/** Everything the interaction wiring needs from the panel's environment. */
export interface MeasureAttachDeps {
    readonly map: maplibregl.Map;
    readonly overlayManager: OverlayManager<Layer>;
    readonly getPointCloudData: (layerId: string) => PointCloudData | undefined;
    /** Called when Escape means "close the tool" (not in edit mode). */
    readonly onEscape: () => void;
}

export interface MeasureControllerConfig {
    readonly layerPrefix: string;
    readonly drawingKind: GeometryKind;
}

/**
 * Interaction orchestration of a measure tool: click-to-place, move-preview,
 * drag-to-edit, middle-click edit toggle, keyboard shortcuts (Escape, E,
 * Ctrl+Z). Owns no state of its own — geometry lives in the TechLayerStore;
 * the panel is a thin observer and wires attach/detach on mount/unmount.
 */
export class MeasureController extends MapInteractionController<MeasureAttachDeps> {
    constructor(
        readonly store: TechLayerStore,
        private readonly config: MeasureControllerConfig,
    ) {
        super();
    }

    /** Wires the handlers; starts a drawing when none exists. */
    override attach(deps: MeasureAttachDeps): void {
        super.attach(deps);
        this.ensureDrawing();
    }

    /** Starts a fresh drawing of the configured kind when none is active. */
    ensureDrawing(): void {
        if (!this.store.drawing) {
            this.store.startDrawing(this.config.drawingKind);
        }
    }

    /** Full reset: geometries, drawing, and a fresh drawing of the kind. */
    reset(): void {
        this.store.reset();
        this.store.startDrawing(this.config.drawingKind);
    }

    protected mapHandlers(): ReadonlyArray<MapHandlerBinding> {
        return [
            { event: "click", listener: this.handleMapClick },
            { event: "mousemove", listener: this.handleMapMouseMove },
            { event: "mousedown", listener: this.handleMapMouseDown },
            { event: "mouseup", listener: this.handleMapMouseUp },
            { event: "mousedown", listener: this.handleMiddleClick },
        ];
    }

    private pickPoint(event: maplibregl.MapMouseEvent) {
        const deps = this.deps;
        if (!deps) return null;
        return getPointWithFallback({
            screenX: event.point.x,
            screenY: event.point.y,
            eventLngLat: event.lngLat,
            getPointCloudData: deps.getPointCloudData,
            overlayManager: deps.overlayManager,
            excludeLayerPrefix: this.config.layerPrefix,
        });
    }

    private handleMapClick = (event: maplibregl.MapMouseEvent): void => {
        if (this.store.editMode) return;
        const point = this.pickPoint(event);
        if (point) this.store.addPoint(point);
    };

    private handleMapMouseMove = (event: maplibregl.MapMouseEvent): void => {
        const store = this.store;
        if (store.draggingIndex !== null) {
            const point = this.pickPoint(event);
            const idx = store.draggingIndex;
            const drawingId = store.drawing?.id;
            if (!drawingId) return;

            if (point) {
                store.moveNode(drawingId, idx, point);
            } else {
                const draggedPoint = store.drawing?.points[idx];
                if (draggedPoint) {
                    store.moveNode(drawingId, idx, {
                        lng: event.lngLat.lng,
                        lat: event.lngLat.lat,
                        z: draggedPoint.z,
                    });
                }
            }
        } else if (!store.editMode) {
            store.setPreviewPoint(this.pickPoint(event));
        }
    };

    /**
     * The drawing node index under the cursor, or null when the pick misses
     * the tool's points layer or lands outside the drawing.
     */
    private pickDrawingNodeIndex(
        event: maplibregl.MapMouseEvent,
    ): number | null {
        const deps = this.deps;
        if (!deps) return null;
        const pickingInfo = deps.overlayManager.pickObject(
            event.point.x,
            event.point.y,
            EDIT_NODE_PICK_RADIUS_PX,
        );
        const pointsLayerId = `${this.config.layerPrefix}-points`;
        if (
            !pickingInfo?.layer ||
            pickingInfo.layer.id !== pointsLayerId ||
            pickingInfo.index == null ||
            pickingInfo.index < 0
        ) {
            return null;
        }
        return pickingInfo.index < (this.store.drawing?.points.length ?? 0)
            ? pickingInfo.index
            : null;
    }

    private handleMapMouseDown = (event: maplibregl.MapMouseEvent): void => {
        if (!this.store.editMode) return;
        const idx = this.pickDrawingNodeIndex(event);
        if (idx !== null) {
            this.store.startDrag(idx);
            event.preventDefault();
        }
    };

    private handleMapMouseUp = (): void => {
        this.store.endDrag();
    };

    private handleMiddleClick = (event: maplibregl.MapMouseEvent): void => {
        if (isMiddleClick(event)) {
            event.preventDefault();
            this.store.toggleEditMode();
        }
    };

    protected handleKeyDown = (event: KeyboardEvent): void => {
        const store = this.store;
        if (event.key === "Escape") {
            if (store.editMode) {
                store.exitEditMode();
            } else {
                this.deps?.onEscape();
            }
        } else if (event.key === "e" || event.key === "E") {
            event.preventDefault();
            store.toggleEditMode();
        } else if (event.key === "z" && event.ctrlKey) {
            event.preventDefault();
            store.removeLastPoint();
        }
    };
}

/** Canvas cursor for the current measurement interaction state. */
export function measureCursor(
    draggingIndex: number | null,
    editMode: boolean,
): string {
    if (draggingIndex !== null) return "grabbing";
    return editMode ? "move" : "crosshair";
}

/**
 * Panel wiring for a controller: attach on mount, detach on unmount — the
 * only `useEffect` a measure panel keeps.
 */
export function useAttachedController(
    controller: { attach(deps: MeasureAttachDeps): void; detach(): void },
    deps: MeasureAttachDeps,
): void {
    const { map, overlayManager, getPointCloudData, onEscape } = deps;
    useEffect(() => {
        controller.attach({ map, overlayManager, getPointCloudData, onEscape });
        return () => controller.detach();
    }, [controller, map, overlayManager, getPointCloudData, onEscape]);
}
