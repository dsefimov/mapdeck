/**
 * Shared hook for measurement tool map interaction.
 *
 * Handles click-to-place, move-preview, drag-to-edit, middle-click edit toggle,
 * and keyboard shortcuts (Escape, E, Ctrl+Z, Delete).
 *
 * Delegates all mutations to the provided MeasureToolStore.
 */
import { useEffect, useCallback, useRef } from "react";
import type maplibregl from "maplibre-gl";
import type { DeckOverlayManager } from "@core/domain/overlay";
import type { LayerAdapterFactory } from "@core/domain/adapters";
import { getPointWithFallback } from "@core/domain/point-cloud/picking";
import { MeasureToolStore } from "@map-tools/shared/MeasureToolStore";

export interface UseMeasureInteractionOptions {
    map: maplibregl.Map;
    overlayManager: DeckOverlayManager;
    adapterFactory: LayerAdapterFactory;
    store: MeasureToolStore;
    layerPrefix: string;
    pointsLayerId: string;
    onDeactivate: () => void;
}

/**
 * Subscribe to map events and route them to the MeasureToolStore.
 *
 * - Left click: add a point (unless in edit mode)
 * - Mouse move: preview point (unless dragging) / update dragged point
 * - Mouse down on a point: start dragging
 * - Mouse up: end dragging
 * - Middle click / E key: toggle edit mode
 * - Ctrl+Z: undo last point
 * - Escape: exit edit mode (if editing) or deactivate
 */
export function useMeasureInteraction(
    options: UseMeasureInteractionOptions,
): void {
    const {
        map,
        overlayManager,
        adapterFactory,
        store,
        layerPrefix,
        pointsLayerId,
        onDeactivate,
    } = options;

    // Keep a ref to the store for use inside callbacks without re-creating them
    const storeRef = useRef(store);
    storeRef.current = store;

    const handleMapClick = useCallback(
        (event: maplibregl.MapMouseEvent) => {
            const s = storeRef.current;
            if (s.editMode) return;

            const point = getPointWithFallback({
                screenX: event.point.x,
                screenY: event.point.y,
                eventLngLat: event.lngLat,
                adapterFactory,
                overlayManager,
                excludeLayerPrefix: layerPrefix,
            });

            if (point) {
                s.addPoint(point);
            }
        },
        [adapterFactory, overlayManager, layerPrefix],
    );

    const handleMapMouseMove = useCallback(
        (event: maplibregl.MapMouseEvent) => {
            const s = storeRef.current;

            if (s.draggingIndex !== null) {
                // Dragging mode: update dragged point
                const point = getPointWithFallback({
                    screenX: event.point.x,
                    screenY: event.point.y,
                    eventLngLat: event.lngLat,
                    adapterFactory,
                    overlayManager,
                    excludeLayerPrefix: layerPrefix,
                });

                const idx = s.draggingIndex;
                if (point) {
                    s.replacePoint(idx, point);
                } else {
                    const draggedPoint = s.points[idx];
                    if (draggedPoint) {
                        s.replacePoint(idx, {
                            lng: event.lngLat.lng,
                            lat: event.lngLat.lat,
                            z: draggedPoint.z,
                        });
                    }
                }
            } else if (!s.editMode) {
                // Preview mode: show hover point
                const point = getPointWithFallback({
                    screenX: event.point.x,
                    screenY: event.point.y,
                    eventLngLat: event.lngLat,
                    adapterFactory,
                    overlayManager,
                    excludeLayerPrefix: layerPrefix,
                });
                s.setPreviewPoint(point);
            }
        },
        [adapterFactory, overlayManager, layerPrefix],
    );

    const handleMapMouseDown = useCallback(
        (event: maplibregl.MapMouseEvent) => {
            const s = storeRef.current;
            if (!s.editMode) return;

            const pickingInfo = overlayManager.pickObject(
                event.point.x,
                event.point.y,
                10,
            );
            if (
                pickingInfo &&
                pickingInfo.layer &&
                pickingInfo.layer.id === pointsLayerId &&
                pickingInfo.index != null
            ) {
                const idx = pickingInfo.index;
                if (idx >= 0 && idx < s.points.length) {
                    s.startDrag(idx);
                    event.preventDefault();
                }
            }
        },
        [overlayManager, pointsLayerId],
    );

    const handleMapMouseUp = useCallback(() => {
        storeRef.current.endDrag();
    }, []);

    const handleMiddleClick = useCallback((event: maplibregl.MapMouseEvent) => {
        if (
            event.originalEvent instanceof MouseEvent &&
            event.originalEvent.button === 1
        ) {
            event.preventDefault();
            storeRef.current.toggleEditMode();
        }
    }, []);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            const s = storeRef.current;
            if (event.key === "Escape") {
                if (s.editMode) {
                    s.exitEditMode();
                } else {
                    onDeactivate();
                }
            } else if (event.key === "e" || event.key === "E") {
                event.preventDefault();
                s.toggleEditMode();
            } else if (event.key === "z" && event.ctrlKey) {
                event.preventDefault();
                s.removeLastPoint();
            }
        },
        [onDeactivate],
    );

    // ---- Subscriptions ----
    useEffect(() => {
        map.on("click", handleMapClick);
        map.on("mousemove", handleMapMouseMove);
        map.on("mousedown", handleMapMouseDown);
        map.on("mouseup", handleMapMouseUp);
        map.on("mousedown", handleMiddleClick);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            map.off("click", handleMapClick);
            map.off("mousemove", handleMapMouseMove);
            map.off("mousedown", handleMapMouseDown);
            map.off("mouseup", handleMapMouseUp);
            map.off("mousedown", handleMiddleClick);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [
        map,
        handleMapClick,
        handleMapMouseMove,
        handleMapMouseDown,
        handleMapMouseUp,
        handleMiddleClick,
        handleKeyDown,
    ]);

    // Auto-exit edit mode when points become empty
    const pointsLen = store.points.length;
    useEffect(() => {
        if (pointsLen === 0 && store.editMode) {
            store.exitEditMode();
        }
    }, [pointsLen, store]);

    // Update map cursor based on edit mode and dragging
    useEffect(() => {
        const canvas = map.getCanvas();
        if (!canvas) return;

        if (store.draggingIndex !== null) {
            canvas.style.cursor = "grabbing";
        } else if (store.editMode) {
            canvas.style.cursor = "move";
        } else {
            canvas.style.cursor = "crosshair";
        }

        return () => {
            canvas.style.cursor = "";
        };
    }, [map, store.editMode, store.draggingIndex]);
}
