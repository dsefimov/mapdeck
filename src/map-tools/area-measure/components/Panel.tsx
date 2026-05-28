import React, {
    useEffect,
    useState,
    useRef,
    useCallback,
    useMemo,
} from "react";
import { observer } from "mobx-react-lite";
import maplibregl from "maplibre-gl";
import { getPointWithFallback } from "@core/domain/point-cloud/picking";
import {
    formatDistance,
    formatArea,
    convertPointToDegrees,
} from "@core/shared/geo/formatters";
import {
    getThemeColor,
    THEME_PRIMARY,
    THEME_SECONDARY,
    THEME_SUCCESS,
    COLOR_ALPHA_FILL,
    COLOR_ALPHA_STROKE,
    COLOR_ALPHA_PREVIEW,
} from "@core/shared/ui";
import { formatDict } from "@core/framework/i18n";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import area from "@turf/area";
import { polygon } from "@turf/helpers";

import type {
    MapToolComponentProps,
    MeasurementPoint3D,
} from "@core/framework/types";

import { ToolPanel, SegmentsList } from "@core/ui/composites";
import type { Segment } from "@core/ui/composites";
import { PolygonLayer, ScatterplotLayer, LineLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import type { PolygonEdge, AreaMeasurements } from "../types";

import styles from "@core/ui/composites/measurement-panel/MeasurementPanel.module.css";
import toolStyles from "@core/ui/composites/tool-panel/ToolPanel.module.css";

// Layer IDs for area-measure tool
const AREA_MEASURE_LAYER_PREFIX = "area-measure-";
const AREA_MEASURE_POLYGON_LAYER_ID = "area-measure-polygon";
const AREA_MEASURE_POINTS_LAYER_ID = "area-measure-points";
const AREA_MEASURE_PREVIEW_POINT_LAYER_ID = "area-measure-preview-point";
const AREA_MEASURE_PREVIEW_LINE_LAYER_ID = "area-measure-preview-line";

/**
 * Calculate geodesic distance between two points in meters
 */
function geodesicDistance(p1: [number, number], p2: [number, number]): number {
    return distance(point(p1), point(p2), { units: "meters" });
}

/**
 * Calculate 2D area from MeasurementPoint3D array using @turf/area
 * Projects points to a polygon and calculates area in square meters
 */
function calculateArea2D(points: MeasurementPoint3D[]): number {
    if (points.length < 3) return 0;

    // Create polygon coordinates (close the ring by repeating first point)
    const coords = points.map((p) => [p.lng, p.lat]);
    coords.push([points[0]!.lng, points[0]!.lat]); // Close the ring

    const poly = polygon([coords]);
    return area(poly);
}

/**
 * Calculate perimeter from points
 */
function calculatePerimeter(points: MeasurementPoint3D[]): number {
    if (points.length < 2) return 0;

    let perimeter = 0;
    for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1]!;
        const p2 = points[i]!;
        perimeter += geodesicDistance([p1.lng, p1.lat], [p2.lng, p2.lat]);
    }
    return perimeter;
}

/**
 * Calculate edges with distances
 */
function calculateEdges(points: MeasurementPoint3D[]): PolygonEdge[] {
    if (points.length < 2) return [];

    const edges: PolygonEdge[] = [];
    for (let i = 1; i < points.length; i++) {
        const from = points[i - 1]!;
        const to = points[i]!;
        edges.push({
            from,
            to,
            distanceMeters: geodesicDistance(
                [from.lng, from.lat],
                [to.lng, to.lat],
            ),
        });
    }
    return edges;
}

/**
 * Main Area Measure component
 */
export const AreaMeasureComponent: (
    props: MapToolComponentProps,
) => React.ReactNode = observer(
    ({ map, deactivate, rootStore, overlayManager }) => {
        const dict = rootStore.localeStore.t("area-measure");
        const adapterFactory = rootStore.layerAdapterFactory;
        const [points, setPoints] = useState<MeasurementPoint3D[]>([]);
        const [previewPoint, setPreviewPoint] =
            useState<MeasurementPoint3D | null>(null);
        const [editMode, setEditMode] = useState(false);
        const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
        const pointsRef = useRef<MeasurementPoint3D[]>([]);

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

        // Event handlers
        const handleMapClick = useCallback(
            (event: maplibregl.MapMouseEvent) => {
                if (editMode) return;

                const point = getPointWithFallback({
                    screenX: event.point.x,
                    screenY: event.point.y,
                    eventLngLat: event.lngLat,
                    adapterFactory,
                    overlayManager: overlayManager,
                    excludeLayerPrefix: AREA_MEASURE_LAYER_PREFIX,
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
                    const point = getPointWithFallback({
                        screenX: event.point.x,
                        screenY: event.point.y,
                        eventLngLat: event.lngLat,
                        adapterFactory,
                        overlayManager: overlayManager,
                        excludeLayerPrefix: AREA_MEASURE_LAYER_PREFIX,
                    });

                    if (point) {
                        setPoints((prev) =>
                            prev.map((p, i) =>
                                i === draggingIndex ? point : p,
                            ),
                        );
                    } else {
                        const draggedPoint = pointsRef.current[draggingIndex];
                        if (draggedPoint) {
                            const newPoint: MeasurementPoint3D = {
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
                    const point = getPointWithFallback({
                        screenX: event.point.x,
                        screenY: event.point.y,
                        eventLngLat: event.lngLat,
                        adapterFactory,
                        overlayManager: overlayManager,
                        excludeLayerPrefix: AREA_MEASURE_LAYER_PREFIX,
                    });

                    setPreviewPoint(point);
                }
            },
            [adapterFactory, draggingIndex, editMode, overlayManager],
        );

        const handleMapMouseDown = useCallback(
            (event: maplibregl.MapMouseEvent) => {
                if (!editMode) return;

                const pickingInfo = overlayManager.pickObject(
                    event.point.x,
                    event.point.y,
                    10,
                );
                if (
                    pickingInfo &&
                    pickingInfo.layer &&
                    pickingInfo.layer.id === AREA_MEASURE_POINTS_LAYER_ID &&
                    pickingInfo.index != null
                ) {
                    const index = pickingInfo.index;
                    if (index >= 0 && index < pointsRef.current.length) {
                        setDraggingIndex(index);
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
                    event.preventDefault();
                    setPoints((prev) => prev.slice(0, -1));
                }
            },
            [editMode, deactivate],
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

        // Update cursor
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

        // Calculate measurements
        const measurements: AreaMeasurements = useMemo(() => {
            const edges = calculateEdges(points);
            const perimeter = calculatePerimeter(points);
            const areaSquareMeters = calculateArea2D(points);

            return {
                areaSquareMeters,
                perimeterMeters: perimeter,
                edges,
                vertexCount: points.length,
            };
        }, [points]);

        // Data for polygon
        const polygonData = useMemo(() => {
            if (points.length < 3) return null;

            const coords = points.map((p) => convertPointToDegrees(p));
            coords.push(convertPointToDegrees(points[0]!)); // Close the ring

            return [coords];
        }, [points]);

        // Data for points
        const pointsData = useMemo(() => {
            return points.map((point, index) => ({
                position: convertPointToDegrees(point),
                index,
            }));
        }, [points]);

        // Data for preview point
        const previewPointData = useMemo(() => {
            if (!previewPoint) return null;

            return {
                position: convertPointToDegrees(previewPoint),
            };
        }, [previewPoint]);

        // Data for preview line
        const previewLineData = useMemo(() => {
            if (!previewPoint || points.length === 0) return null;

            const lastPoint = points[points.length - 1]!;
            return [
                convertPointToDegrees(lastPoint),
                convertPointToDegrees(previewPoint),
            ];
        }, [previewPoint, points]);

        // Create polygon layer
        const polygonLayer = useMemo(() => {
            if (!polygonData) return null;

            const fillColor = getThemeColor(THEME_PRIMARY, COLOR_ALPHA_FILL);
            const lineColor = getThemeColor(THEME_PRIMARY, COLOR_ALPHA_STROKE);

            return new PolygonLayer({
                id: AREA_MEASURE_POLYGON_LAYER_ID,
                data: polygonData,
                getPolygon: (d: [number, number, number][]) => d,
                getFillColor: fillColor,
                getLineColor: lineColor,
                getLineWidth: 3,
                lineWidthUnits: "pixels",
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
                pickable: false,
                lineJointRounded: true,
            });
        }, [polygonData]);

        // Create points layer
        const pointsLayer = useMemo(() => {
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
                id: AREA_MEASURE_POINTS_LAYER_ID,
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

        // Create preview point layer
        const previewPointLayer = useMemo(() => {
            if (!previewPointData) return null;

            const previewColor = getThemeColor(
                THEME_SUCCESS,
                COLOR_ALPHA_PREVIEW,
            );

            return new ScatterplotLayer({
                id: AREA_MEASURE_PREVIEW_POINT_LAYER_ID,
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

        // Create preview line layer
        const previewLineLayer = useMemo(() => {
            if (!previewLineData) return null;

            const previewColor = getThemeColor(
                THEME_SUCCESS,
                COLOR_ALPHA_PREVIEW,
            );

            return new LineLayer({
                id: AREA_MEASURE_PREVIEW_LINE_LAYER_ID,
                data: [previewLineData],
                getPath: (d: unknown) => d as [number, number, number][],
                getColor: previewColor,
                getWidth: 2,
                widthUnits: "pixels",
                pickable: false,
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
            });
        }, [previewLineData]);

        // Manage deck.gl layers
        useEffect(() => {
            if (!overlayManager) return;

            const layers = [
                { id: AREA_MEASURE_POLYGON_LAYER_ID, layer: polygonLayer },
                { id: AREA_MEASURE_POINTS_LAYER_ID, layer: pointsLayer },
                {
                    id: AREA_MEASURE_PREVIEW_POINT_LAYER_ID,
                    layer: previewPointLayer,
                },
                {
                    id: AREA_MEASURE_PREVIEW_LINE_LAYER_ID,
                    layer: previewLineLayer,
                },
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
            pointsLayer,
            polygonLayer,
            previewLineLayer,
            previewPointLayer,
            overlayManager,
        ]);

        // Convert edges to the format expected by SegmentsList
        const segmentItems: Segment[] = useMemo(
            () =>
                measurements.edges.map((edge, index) => ({
                    label: formatDict(dict["segment.label"]!, {
                        from: index + 1,
                        to: index + 2,
                    }),
                    value: formatDistance(edge.distanceMeters),
                })),
            [measurements.edges, dict],
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
                {points.length >= 3 && (
                    <div className={styles.measurementSummary}>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryLabel}>
                                {dict["summary.area"]}
                            </span>
                            <span className={styles.summaryValue}>
                                {formatArea(measurements.areaSquareMeters)}
                            </span>
                        </div>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryLabel}>
                                {dict["summary.perimeter"]}
                            </span>
                            <span className={styles.summaryValue}>
                                {formatDistance(measurements.perimeterMeters)}
                            </span>
                        </div>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryLabel}>
                                {dict["summary.vertices"]}
                            </span>
                            <span className={styles.summaryValue}>
                                {measurements.vertexCount}
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

export default AreaMeasureComponent;
