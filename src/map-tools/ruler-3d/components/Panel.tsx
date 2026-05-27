import React, { useEffect, useState, useRef, useCallback } from "react";
import { observer } from "mobx-react-lite";
import maplibregl from "maplibre-gl";
import {
    geodesicDistance,
    getPointWithFallback,
    formatDistance,
    convertPointToDegrees,
} from "../utils/coordinates";
import {
    getThemeColor,
    THEME_PRIMARY,
    THEME_SECONDARY,
    THEME_SUCCESS,
    COLOR_ALPHA_STROKE,
    COLOR_ALPHA_PREVIEW,
} from "@core/shared/ui";
import { formatDict } from "@core/framework/i18n";

import type { MapToolComponentProps } from "@core/framework/types";

import { ToolPanel, SegmentsList } from "@core/ui/composites";
import type { Segment } from "@core/ui/composites";
import { PathLayer, ScatterplotLayer, LineLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import type { Point3D, SegmentDistance3D } from "../types";

import styles from "@core/ui/composites/measurement-panel/MeasurementPanel.module.css";
import toolStyles from "@core/ui/composites/tool-panel/ToolPanel.module.css";

// Re-export types for backward compatibility
export type { Point3D, SegmentDistance3D } from "../types";

// Layer IDs for ruler-3d tool
const RULER_3D_LAYER_PREFIX = "ruler-3d-";
const RULER_3D_POINTS_LAYER_ID = "ruler-3d-points";
const RULER_3D_PATH_LAYER_ID = "ruler-3d-path";
const RULER_3D_PREVIEW_POINT_LAYER_ID = "ruler-3d-preview-point";
const RULER_3D_PREVIEW_LINE_LAYER_ID = "ruler-3d-preview-line";

// Utility functions for distance calculations
function getEuclideanDistance3D(p1: Point3D, p2: Point3D): number {
    // Convert degrees to meters for 3D distance calculation
    const horizontalDist = geodesicDistance([p1.lng, p1.lat], [p2.lng, p2.lat]);
    const dz = p2.z - p1.z;
    return Math.sqrt(horizontalDist * horizontalDist + dz * dz);
}

function getHorizontalDistance(p1: Point3D, p2: Point3D): number {
    return geodesicDistance([p1.lng, p1.lat], [p2.lng, p2.lat]);
}

function getVerticalDistance(p1: Point3D, p2: Point3D): number {
    return Math.abs(p2.z - p1.z);
}

/**
 * Main 3D Ruler component
 */
export const Ruler3DComponent: (
    props: MapToolComponentProps,
) => React.ReactNode = observer(
    ({ map, deactivate, rootStore, overlayManager }) => {
        const dict = rootStore.localeStore.t("ruler-3d");
        const adapterFactory = rootStore.layerAdapterFactory;
        const [points, setPoints] = useState<Point3D[]>([]);
        const [previewPoint, setPreviewPoint] = useState<Point3D | null>(null);
        const [editMode, setEditMode] = useState(false);
        const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
        const pointsRef = useRef<Point3D[]>([]);

        // Sync ref with state
        useEffect(() => {
            pointsRef.current = points;
        }, [points]);

        // Auto-exit edit mode when points become empty
        useEffect(() => {
            if (points.length === 0 && editMode) {
                setEditMode(false);
                setDraggingIndex(null);
            }
        }, [points, editMode]);

        // Event handlers with useCallback for stable references
        const handleMapClick = useCallback(
            (event: maplibregl.MapMouseEvent) => {
                if (editMode) return;

                const point = getPointWithFallback({
                    screenX: event.point.x,
                    screenY: event.point.y,
                    eventLngLat: event.lngLat,
                    adapterFactory,
                    overlayManager,
                    excludeLayerPrefix: RULER_3D_LAYER_PREFIX,
                });

                if (point) {
                    setPoints((prev) => [...prev, point]);
                }
            },
            [adapterFactory, editMode, overlayManager],
        );

        const handleMapMouseMove = useCallback(
            (event: maplibregl.MapMouseEvent) => {
                if (draggingIndex !== null) {
                    // Dragging mode: update dragged point
                    const point = getPointWithFallback({
                        screenX: event.point.x,
                        screenY: event.point.y,
                        eventLngLat: event.lngLat,
                        adapterFactory,
                        overlayManager,
                        excludeLayerPrefix: RULER_3D_LAYER_PREFIX,
                    });

                    if (point) {
                        setPoints((prev) =>
                            prev.map((p, i) =>
                                i === draggingIndex ? point : p,
                            ),
                        );
                    } else {
                        // No point cloud under cursor - create point from map coordinates
                        const draggedPoint = pointsRef.current[draggingIndex];
                        if (draggedPoint) {
                            const newPoint: Point3D = {
                                lng: event.lngLat.lng,
                                lat: event.lngLat.lat,
                                z: draggedPoint.z,
                            };
                            setPoints((prev) =>
                                prev.map((p, i) =>
                                    i === draggingIndex ? newPoint : p,
                                ),
                            );
                        }
                    }
                } else if (!editMode) {
                    // Preview mode: show hover point
                    const point = getPointWithFallback({
                        screenX: event.point.x,
                        screenY: event.point.y,
                        eventLngLat: event.lngLat,
                        adapterFactory,
                        overlayManager,
                        excludeLayerPrefix: RULER_3D_LAYER_PREFIX,
                    });

                    setPreviewPoint(point);
                }
            },
            [adapterFactory, draggingIndex, editMode, overlayManager],
        );

        const handleMapMouseDown = useCallback(
            (event: maplibregl.MapMouseEvent) => {
                if (!editMode) return;

                // Use Deck.gl picking to detect ruler points
                const pickingInfo = overlayManager.pickObject(
                    event.point.x,
                    event.point.y,
                    10,
                );
                if (
                    pickingInfo &&
                    pickingInfo.layer &&
                    pickingInfo.layer.id === RULER_3D_POINTS_LAYER_ID &&
                    pickingInfo.index != null
                ) {
                    const index = pickingInfo.index;
                    if (index >= 0 && index < pointsRef.current.length) {
                        setDraggingIndex(index);
                        // Prevent map panning when dragging points
                        event.preventDefault();
                        return;
                    }
                }
            },
            [editMode, overlayManager],
        );

        const handleMapMouseUp = useCallback(() => {
            setDraggingIndex(null);
        }, []);

        const handleMiddleClick = useCallback(
            (event: maplibregl.MapMouseEvent) => {
                if (
                    event.originalEvent instanceof MouseEvent &&
                    event.originalEvent.button === 1
                ) {
                    event.preventDefault();
                    setEditMode((prev) => !prev);
                    setPreviewPoint(null);
                }
            },
            [],
        );

        const handleKeyDown = useCallback(
            (event: KeyboardEvent) => {
                if (event.key === "Escape") {
                    if (editMode) {
                        setEditMode(false);
                        setDraggingIndex(null);
                    } else {
                        deactivate();
                    }
                } else if (event.key === "e" || event.key === "E") {
                    event.preventDefault();
                    setEditMode((prev) => !prev);
                    setPreviewPoint(null);
                } else if (event.key === "z" && event.ctrlKey) {
                    // Ctrl+Z: undo last point
                    event.preventDefault();
                    setPoints((prev) => prev.slice(0, -1));
                } else if (
                    event.key === "Delete" &&
                    editMode &&
                    points.length > 0
                ) {
                    // Delete selected point if we had selection (future enhancement)
                }
            },
            [editMode, deactivate, points.length],
        );

        // Subscribe to map events
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

        // Update map cursor based on edit mode and dragging
        useEffect(() => {
            const canvas = map.getCanvas();
            if (!canvas) return;

            if (draggingIndex !== null) {
                canvas.style.cursor = "grabbing";
            } else if (editMode) {
                canvas.style.cursor = "move";
            } else {
                canvas.style.cursor = "crosshair";
            }

            return () => {
                canvas.style.cursor = "";
            };
        }, [map, editMode, draggingIndex]);

        // Calculate distances - use useMemo to avoid recalculating on every render
        const { segments, totalDistance, totalHorizontal, totalVertical } =
            React.useMemo(() => {
                const segs: SegmentDistance3D[] = [];
                for (let i = 1; i < points.length; i++) {
                    const from = points[i - 1]!;
                    const to = points[i]!;

                    segs.push({
                        from,
                        to,
                        distanceMeters: getEuclideanDistance3D(from, to),
                        horizontalDistance: getHorizontalDistance(from, to),
                        verticalDistance: getVerticalDistance(from, to),
                    });
                }

                const totalDist = segs.reduce(
                    (sum, seg) => sum + seg.distanceMeters,
                    0,
                );
                const totalHoriz = segs.reduce(
                    (sum, seg) => sum + seg.horizontalDistance,
                    0,
                );
                const totalVert = segs.reduce(
                    (sum, seg) => sum + seg.verticalDistance,
                    0,
                );

                return {
                    segments: segs,
                    totalDistance: totalDist,
                    totalHorizontal: totalHoriz,
                    totalVertical: totalVert,
                };
            }, [points]);

        // Data for measurement points (convert to geographic coordinates)
        const pointsData = React.useMemo(() => {
            const data = points.map((point, index) => {
                const [lng, lat, elevation] = convertPointToDegrees(point);
                return {
                    position: [lng, lat, elevation] as [number, number, number],
                    index,
                };
            });

            return data;
        }, [points]);

        // Data for preview point (convert to geographic coordinates)
        const previewPointData = React.useMemo(() => {
            if (!previewPoint) {
                return null;
            }

            const [lng, lat, elevation] = convertPointToDegrees(previewPoint);
            return {
                position: [lng, lat, elevation] as [number, number, number],
            };
        }, [previewPoint]);

        // Data for preview line (convert to geographic coordinates)
        const previewLineData = React.useMemo(() => {
            if (!previewPoint || points.length === 0) {
                return null;
            }
            const lastPoint = points[points.length - 1];
            if (!lastPoint) return null;

            const [lng1, lat1, elev1] = convertPointToDegrees(lastPoint);
            const [lng2, lat2, elev2] = convertPointToDegrees(previewPoint);

            const previewLineResult = [
                [lng1, lat1, elev1],
                [lng2, lat2, elev2],
            ] as [number, number, number][];

            return previewLineResult;
        }, [previewPoint, points]);

        // Create PathLayer for 3D lines in deck.gl (using LNGLAT)
        const pathLayer = React.useMemo(() => {
            if (points.length < 2) return null;

            const primaryColor = getThemeColor(
                THEME_PRIMARY,
                COLOR_ALPHA_STROKE,
            );

            // Convert points to geographic coordinates
            const pathData = points.map((point) => {
                const [lng, lat, elevation] = convertPointToDegrees(point);
                return [lng, lat, elevation];
            });

            // Create path layer with LNGLAT coordinate system
            return new PathLayer({
                id: RULER_3D_PATH_LAYER_ID,
                data: [pathData],
                getPath: (d: [number, number, number][]) => d,
                getColor: primaryColor,
                getWidth: 4,
                widthUnits: "pixels",
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
                pickable: false,
                capRounded: true,
                jointRounded: true,
                widthMinPixels: 2,
                widthMaxPixels: 8,
            });
        }, [points]);

        // Create points layer (using LNGLAT)
        const pointsLayer = React.useMemo(() => {
            if (pointsData.length === 0) return null;

            const primaryColor = getThemeColor(
                THEME_PRIMARY,
                COLOR_ALPHA_STROKE,
            );
            const editModeColor = getThemeColor(
                THEME_SECONDARY,
                COLOR_ALPHA_STROKE,
            );

            return new ScatterplotLayer({
                id: RULER_3D_POINTS_LAYER_ID,
                data: pointsData,
                getPosition: (d: { position: [number, number, number] }) =>
                    d.position,
                getRadius: 6,
                getFillColor: editMode ? editModeColor : primaryColor,
                radiusUnits: "pixels",
                pickable: true,
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
                radiusMinPixels: 4,
                radiusMaxPixels: 10,
            });
        }, [pointsData, editMode]);

        // Create preview point layer (using LNGLAT)
        const previewPointLayer = React.useMemo(() => {
            if (!previewPointData) return null;

            const previewColor = getThemeColor(
                THEME_SUCCESS,
                COLOR_ALPHA_PREVIEW,
            );

            return new ScatterplotLayer({
                id: RULER_3D_PREVIEW_POINT_LAYER_ID,
                data: [previewPointData],
                getPosition: (d: { position: [number, number, number] }) =>
                    d.position,
                getRadius: 6,
                getFillColor: previewColor,
                radiusUnits: "pixels",
                pickable: false,
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
            });
        }, [previewPointData]);

        // Create preview line layer (using LNGLAT)
        const previewLineLayer = React.useMemo(() => {
            if (!previewLineData) return null;

            const previewColor = getThemeColor(
                THEME_SUCCESS,
                COLOR_ALPHA_PREVIEW,
            );

            return new LineLayer({
                id: RULER_3D_PREVIEW_LINE_LAYER_ID,
                data: [previewLineData],
                getPath: (d: unknown) => d as [number, number, number][],
                getColor: previewColor,
                getWidth: 2,
                widthUnits: "pixels",
                pickable: false,
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
            });
        }, [previewLineData]);

        // Manage deck.gl layer lifecycle
        useEffect(() => {
            if (!overlayManager) return;

            const layers = [
                { id: RULER_3D_PATH_LAYER_ID, layer: pathLayer },
                { id: RULER_3D_POINTS_LAYER_ID, layer: pointsLayer },
                {
                    id: RULER_3D_PREVIEW_POINT_LAYER_ID,
                    layer: previewPointLayer,
                },
                { id: RULER_3D_PREVIEW_LINE_LAYER_ID, layer: previewLineLayer },
            ];

            layers.forEach(({ id, layer }) => {
                if (layer) {
                    overlayManager.addLayer(id, layer);
                } else {
                    overlayManager.removeLayer(id);
                }
            });

            return () => {
                layers.forEach(({ id }) => overlayManager.removeLayer(id));
            };
        }, [
            overlayManager,
            pathLayer,
            pointsLayer,
            previewLineLayer,
            previewPointLayer,
        ]);

        // Convert segments to the format expected by SegmentsList
        const segmentItems: Segment[] = React.useMemo(
            () =>
                segments.map((segment, index) => ({
                    label: formatDict(dict["segment.label"]!, {
                        from: index + 1,
                        to: index + 2,
                    }),
                    value: formatDistance(segment.distanceMeters),
                    details: [
                        {
                            label: dict["segment.horizontal"]!,
                            value: formatDistance(segment.horizontalDistance),
                        },
                        {
                            label: dict["segment.vertical"]!,
                            value: formatDistance(segment.verticalDistance),
                        },
                    ],
                })),
            [segments, dict],
        );

        // Render UI
        return (
            <ToolPanel
                title={editMode ? dict["eyebrow.editMode"] : dict["eyebrow"]}
                hint={editMode ? dict["hint.editMode"] : dict["hint.normal"]}
                actions={
                    <>
                        <button
                            type="button"
                            className={toolStyles.button}
                            disabled={points.length === 0}
                            onClick={() =>
                                setPoints((prev) => prev.slice(0, -1))
                            }
                        >
                            {dict["button.undo"]}
                        </button>
                        <button
                            type="button"
                            className={toolStyles.button}
                            disabled={points.length === 0}
                            onClick={() => setPoints([])}
                        >
                            {dict["button.resetAll"]}
                        </button>
                        <button
                            type="button"
                            className={toolStyles.button}
                            onClick={deactivate}
                        >
                            {dict["button.closeTool"]}
                        </button>
                    </>
                }
            >
                {points.length > 0 && (
                    <div className={styles.measurementSummary}>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryLabel}>
                                {dict["summary.totalDistance"]}
                            </span>
                            <span className={styles.summaryValue}>
                                {formatDistance(totalDistance)}
                            </span>
                        </div>
                        <div className={styles.distanceComponents}>
                            <div className={styles.distanceComponent}>
                                <span className={styles.distanceComponentLabel}>
                                    <span
                                        className={`${styles.distanceComponentDot} ${styles.distanceComponentDotHorizontal}`}
                                    ></span>
                                    {dict["summary.horizontal"]}
                                </span>
                                <span className={styles.distanceComponentValue}>
                                    {formatDistance(totalHorizontal)}
                                </span>
                            </div>
                            <div className={styles.distanceComponent}>
                                <span className={styles.distanceComponentLabel}>
                                    <span
                                        className={`${styles.distanceComponentDot} ${styles.distanceComponentDotVertical}`}
                                    ></span>
                                    {dict["summary.vertical"]}
                                </span>
                                <span className={styles.distanceComponentValue}>
                                    {formatDistance(totalVertical)}
                                </span>
                            </div>
                        </div>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryLabel}>
                                {dict["summary.points"]}
                            </span>
                            <span className={styles.summaryValue}>
                                {points.length}
                            </span>
                        </div>
                    </div>
                )}

                {segmentItems.length > 0 && (
                    <SegmentsList
                        title={dict["segments.title"]!}
                        segments={segmentItems}
                    />
                )}
            </ToolPanel>
        );
    },
);

export default Ruler3DComponent;
