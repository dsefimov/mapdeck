import React, { useEffect, useState, useCallback, useMemo } from "react";
import { observer } from "mobx-react-lite";
import maplibregl from "maplibre-gl";
import { overlayManager } from "@core/domain/overlay";
import {
    convertPointToDegrees,
    formatDistance,
} from "@core/domain/overlay/measurements";
import {
    getThemeColor,
    THEME_PRIMARY,
    THEME_SUCCESS,
    COLOR_ALPHA_FILL,
    COLOR_ALPHA_STROKE,
    COLOR_ALPHA_PREVIEW,
} from "@core/shared/ui";
import {
    isPointInPolygon,
    polygonBoundingBox,
    isPointInBoundingBox,
} from "@core/shared/geo";
import {
    calculateGridTrapezoidVolume,
    formatVolume,
} from "@core/shared/geo/volume";
import { layerAdapterFactory } from "@core/domain/adapters";
import { PointCloudAdapter } from "@core/domain/adapters/layer/impl/PointCloudAdapter";
import { LayerRoles } from "@core/framework/types";
import {
    getPointFromPickingInfo,
    type PickingInfo,
} from "@core/domain/overlay/picking";

import type {
    MapToolComponentProps,
    MeasurementPoint3D,
    PointCloudData,
} from "@core/framework/types";

import { ToolPanel } from "@core/ui/composites";
import {
    PolygonLayer,
    ScatterplotLayer,
    LineLayer,
    SolidPolygonLayer,
} from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";

import styles from "@core/ui/composites/measurement-panel/MeasurementPanel.module.css";
import toolStyles from "@core/ui/composites/tool-panel/ToolPanel.module.css";

// Layer IDs for volume-measure tool
const VOLUME_MEASURE_LAYER_PREFIX = "volume-measure-";
const VOLUME_MEASURE_POLYGON_LAYER_ID = "volume-measure-polygon";
const VOLUME_MEASURE_POINTS_LAYER_ID = "volume-measure-points";
const VOLUME_MEASURE_PREVIEW_POINT_LAYER_ID = "volume-measure-preview-point";
const VOLUME_MEASURE_PREVIEW_LINE_LAYER_ID = "volume-measure-preview-line";
const VOLUME_MEASURE_TIN_LAYER_ID = "volume-measure-tin";

// Max points for Delaunay (performance limit)
const MAX_DELAUNAY_POINTS = 5000;

/**
 * Pick a point from point cloud at screen coordinates
 */
function pickPointFromCloud(
    screenX: number,
    screenY: number,
    _map: maplibregl.Map,
): MeasurementPoint3D | null {
    if (typeof overlayManager.pickObject !== "function") {
        return null;
    }

    const pickingInfo = overlayManager.pickObject(screenX, screenY, 20);

    if (!pickingInfo) {
        return null;
    }

    const layer = pickingInfo.layer;
    if (!layer || !layer.id) {
        return null;
    }

    // Ignore tool's own layers
    if (layer.id.startsWith(VOLUME_MEASURE_LAYER_PREFIX)) {
        return null;
    }

    if (pickingInfo.index == null) {
        return null;
    }

    const result = getPointFromPickingInfo(pickingInfo as PickingInfo);
    if (!result) {
        return null;
    }

    return {
        lng: result.lng,
        lat: result.lat,
        z: result.z,
        layerId: result.layerId,
        pointIndex: result.pointIndex,
        coordinateOrigin: result.coordinateOrigin,
    };
}

/**
 * Filter point cloud points inside a polygon boundary.
 * Uses bounding box pre-filter for performance.
 */
function filterPointsInsidePolygon(
    boundary: MeasurementPoint3D[],
    allCloudPoints: MeasurementPoint3D[],
): MeasurementPoint3D[] {
    if (boundary.length < 3) return [];

    const polygon2D: [number, number][] = boundary.map((p) => [p.lng, p.lat]);
    const bbox = polygonBoundingBox(polygon2D);

    const result: MeasurementPoint3D[] = [];
    for (const pt of allCloudPoints) {
        const pt2D: [number, number] = [pt.lng, pt.lat];
        if (isPointInBoundingBox(pt2D, bbox)) {
            if (isPointInPolygon(pt2D, polygon2D)) {
                result.push(pt);
            }
        }
    }

    return result;
}

/**
 * Extract points from a single PointCloudData object.
 */
function extractPointsFromCloudData(
    data: PointCloudData,
): MeasurementPoint3D[] {
    const points: MeasurementPoint3D[] = [];
    const origin = data.coordinateOrigin;
    const positions = data.positions;
    const pointCount = data.pointCount;

    for (let i = 0; i < pointCount; i++) {
        const base = i * 3;
        points.push({
            lng: origin[0] + positions[base]!,
            lat: origin[1] + positions[base + 1]!,
            z: positions[base + 2]!,
        });
    }

    return points;
}

/**
 * Get all loaded point cloud points from the layer adapter.
 */
function getAllLoadedCloudPoints(): MeasurementPoint3D[] {
    const adapter = layerAdapterFactory.get(LayerRoles.POINT_CLOUD);
    if (!adapter) return [];

    const pcAdapter = adapter as PointCloudAdapter;
    if (!pcAdapter.getLoadedData) return [];

    const internalData = (
        pcAdapter as unknown as {
            currentData: Map<string, PointCloudData>;
        }
    ).currentData;

    if (!internalData) return [];

    const allPoints: MeasurementPoint3D[] = [];
    for (const data of internalData.values()) {
        if (data?.positions) {
            const extracted = extractPointsFromCloudData(data);
            for (const pt of extracted) {
                allPoints.push(pt);
            }
        }
    }

    return allPoints;
}

/**
 * Build top surface polygons for visualization.
 */
function buildTopSurfacePolygons(
    insidePoints: MeasurementPoint3D[],
    boundary: MeasurementPoint3D[],
): [number, number, number][][] {
    if (insidePoints.length < 3 || boundary.length < 3) return [];

    const boundary2D: [number, number][] = boundary.map(
        (p: MeasurementPoint3D) => [p.lng, p.lat],
    );
    const bbox = polygonBoundingBox(boundary2D);

    const cellSizeMeters = 2.0;
    const surfaceSearchRadius = 6.0;
    const centerLat = (bbox[1] + bbox[3]) / 2;
    const cellSizeDeg =
        cellSizeMeters / (111_320 * Math.cos((centerLat * Math.PI) / 180));

    const polygons: [number, number, number][][] = [];
    const [minLng, minLat, maxLng, maxLat] = bbox;

    for (
        let lng = minLng + cellSizeDeg / 2;
        lng <= maxLng;
        lng += cellSizeDeg
    ) {
        for (
            let lat = minLat + cellSizeDeg / 2;
            lat <= maxLat;
            lat += cellSizeDeg
        ) {
            if (!isPointInPolygon([lng, lat], boundary2D)) continue;

            const surfaceZ = interpolateSurfaceZForVis(
                lng,
                lat,
                insidePoints,
                surfaceSearchRadius,
            );

            if (surfaceZ === null) continue;

            const halfDeg = cellSizeDeg / 2;
            const x0 = lng - halfDeg;
            const y0 = lat - halfDeg;
            const x1 = lng + halfDeg;
            const y1 = lat + halfDeg;

            polygons.push([
                [x0, y0, surfaceZ],
                [x1, y0, surfaceZ],
                [x1, y1, surfaceZ],
                [x0, y1, surfaceZ],
            ]);
        }
    }

    return polygons;
}

/**
 * Interpolate surface Z using IDW with 4 nearest cloud points.
 */
function interpolateSurfaceZForVis(
    lng: number,
    lat: number,
    insidePoints: MeasurementPoint3D[],
    searchRadiusMeters: number,
): number | null {
    const nearby: { z: number; dist: number }[] = [];

    for (const cp of insidePoints) {
        const d =
            Math.sqrt((cp.lng - lng) ** 2 + (cp.lat - lat) ** 2) * 111_320;
        if (d <= searchRadiusMeters) {
            nearby.push({ z: cp.z, dist: d });
        }
    }

    if (nearby.length === 0) return null;

    nearby.sort((a, b) => a.dist - b.dist);
    const neighbors = nearby.slice(0, 4);

    let sumWeight = 0;
    let sumZ = 0;
    for (const n of neighbors) {
        const weight = 1 / (n.dist * n.dist + 0.001);
        sumWeight += weight;
        sumZ += n.z * weight;
    }

    return sumZ / sumWeight;
}

/**
 * Main Volume Measure component
 */
export const VolumeMeasureComponent: (
    props: MapToolComponentProps,
) => React.ReactNode = observer(({ map, deactivate, rootStore }) => {
    const dict = rootStore.localeStore.t("volume-measure");
    const [boundary, setBoundary] = useState<MeasurementPoint3D[]>([]);
    const [previewPoint, setPreviewPoint] = useState<MeasurementPoint3D | null>(
        null,
    );
    const [isComplete, setIsComplete] = useState(false);
    const [insidePoints, setInsidePoints] = useState<MeasurementPoint3D[]>([]);

    // When boundary is completed, find points inside
    useEffect(() => {
        if (!isComplete || boundary.length < 3) {
            setInsidePoints([]);
            return;
        }

        const allCloudPoints = getAllLoadedCloudPoints();
        const filtered = filterPointsInsidePolygon(boundary, allCloudPoints);

        if (filtered.length > MAX_DELAUNAY_POINTS) {
            const step = Math.ceil(filtered.length / MAX_DELAUNAY_POINTS);
            const subsampled = filtered.filter((_, i) => i % step === 0);
            setInsidePoints(subsampled);
        } else {
            setInsidePoints(filtered);
        }
    }, [boundary, isComplete]);

    // Event handlers
    const handleMapClick = useCallback(
        (event: maplibregl.MapMouseEvent) => {
            if (isComplete) return;

            const point = pickPointFromCloud(event.point.x, event.point.y, map);

            if (point) {
                setBoundary((prev) => [...prev, point]);
            }
        },
        [isComplete, map],
    );

    const handleMapMouseMove = useCallback(
        (event: maplibregl.MapMouseEvent) => {
            if (!isComplete) {
                const point = pickPointFromCloud(
                    event.point.x,
                    event.point.y,
                    map,
                );
                setPreviewPoint(point);
            }
        },
        [isComplete, map],
    );

    const handleMiddleClick = useCallback(
        (event: maplibregl.MapMouseEvent) => {
            if (
                event.originalEvent instanceof MouseEvent &&
                event.originalEvent.button === 1
            ) {
                event.preventDefault();
                if (!isComplete && boundary.length >= 3) {
                    setIsComplete(true);
                }
                setPreviewPoint(null);
            }
        },
        [isComplete, boundary.length],
    );

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                if (isComplete) {
                    setIsComplete(false);
                    setInsidePoints([]);
                } else {
                    deactivate();
                }
            } else if (event.key === "Enter" && !isComplete) {
                event.preventDefault();
                setIsComplete(true);
            }
        },
        [isComplete, deactivate],
    );

    // Subscribe to map events
    useEffect(() => {
        map.on("click", handleMapClick);
        map.on("mousemove", handleMapMouseMove);
        map.on("mousedown", handleMiddleClick);

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            map.off("click", handleMapClick);
            map.off("mousemove", handleMapMouseMove);
            map.off("mousedown", handleMiddleClick);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [
        map,
        handleMapClick,
        handleMapMouseMove,
        handleMiddleClick,
        handleKeyDown,
    ]);

    // Update cursor
    useEffect(() => {
        const canvas = map.getCanvas();
        if (!canvas) return;

        canvas.style.cursor = isComplete ? "" : "crosshair";

        return () => {
            canvas.style.cursor = "";
        };
    }, [map, isComplete]);

    // Compute volume measurements using Grid + Trapezoid method
    const volumeMeasurements = useMemo(() => {
        if (insidePoints.length < 3 || boundary.length < 3) {
            return {
                volumeCubicMeters: 0,
                surfaceAreaSquareMeters: 0,
                baseZMin: 0,
                baseZMax: 0,
                surfaceZMin: 0,
                surfaceZMax: 0,
                cloudPointCount: insidePoints.length,
                gridCellCount: 0,
                totalGridCells: 0,
                gridResolution: 0,
            };
        }

        const result = calculateGridTrapezoidVolume(boundary, insidePoints, {
            cellSizeMeters: 2.0,
            searchRadiusMeters: 6.0,
            surfaceNeighborCount: 4,
        });

        return {
            ...result,
            cloudPointCount: insidePoints.length,
        };
    }, [boundary, insidePoints]);

    // Data for polygon
    const polygonData = useMemo(() => {
        if (boundary.length < 2) return null;

        const coords = boundary.map((p) => convertPointToDegrees(p));
        if (isComplete) {
            coords.push(convertPointToDegrees(boundary[0]!));
        }
        return [coords];
    }, [boundary, isComplete]);

    // Data for boundary points
    const boundaryPointsData = useMemo(() => {
        return boundary.map((point, index) => ({
            position: convertPointToDegrees(point),
            index,
        }));
    }, [boundary]);

    // Data for preview point
    const previewPointData = useMemo(() => {
        if (!previewPoint) return null;
        return {
            position: convertPointToDegrees(previewPoint),
        };
    }, [previewPoint]);

    // Data for preview line
    const previewLineData = useMemo(() => {
        if (!previewPoint || boundary.length === 0) return null;
        const lastPoint = boundary[boundary.length - 1]!;
        return [
            convertPointToDegrees(lastPoint),
            convertPointToDegrees(previewPoint),
        ];
    }, [previewPoint, boundary]);

    // Top surface polygons
    const topSurfaceData = useMemo(() => {
        if (insidePoints.length < 3 || !isComplete) return [];
        return buildTopSurfacePolygons(insidePoints, boundary);
    }, [insidePoints, isComplete, boundary]);

    // Deck.gl layers
    const polygonLayer = useMemo(() => {
        if (!polygonData) return null;

        const fillColor = getThemeColor(THEME_PRIMARY, COLOR_ALPHA_FILL);
        const lineColor = getThemeColor(THEME_PRIMARY, COLOR_ALPHA_STROKE);

        return new PolygonLayer({
            id: VOLUME_MEASURE_POLYGON_LAYER_ID,
            data: polygonData,
            getPolygon: (d: [number, number, number][]) => d,
            getFillColor: isComplete ? fillColor : [0, 0, 0, 0],
            getLineColor: lineColor,
            getLineWidth: 3,
            lineWidthUnits: "pixels",
            coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
            pickable: false,
            lineJointRounded: true,
        });
    }, [polygonData, isComplete]);

    const boundaryPointsLayer = useMemo(() => {
        if (boundaryPointsData.length === 0) return null;

        const primaryColor = getThemeColor(THEME_PRIMARY, COLOR_ALPHA_STROKE);

        return new ScatterplotLayer({
            id: VOLUME_MEASURE_POINTS_LAYER_ID,
            data: boundaryPointsData,
            getPosition: (d: { position: [number, number, number] }) =>
                d.position,
            getRadius: 6,
            getFillColor: primaryColor,
            radiusUnits: "pixels",
            pickable: true,
            coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
            radiusMinPixels: 4,
            radiusMaxPixels: 10,
        });
    }, [boundaryPointsData]);

    const previewPointLayer = useMemo(() => {
        if (!previewPointData) return null;

        const previewColor = getThemeColor(THEME_SUCCESS, COLOR_ALPHA_PREVIEW);

        return new ScatterplotLayer({
            id: VOLUME_MEASURE_PREVIEW_POINT_LAYER_ID,
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

    const previewLineLayer = useMemo(() => {
        if (!previewLineData) return null;

        const previewColor = getThemeColor(THEME_SUCCESS, COLOR_ALPHA_PREVIEW);

        return new LineLayer({
            id: VOLUME_MEASURE_PREVIEW_LINE_LAYER_ID,
            data: [previewLineData],
            getPath: (d: unknown) => d as [number, number, number][],
            getColor: previewColor,
            getWidth: 2,
            widthUnits: "pixels",
            pickable: false,
            coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
        });
    }, [previewLineData]);

    // Top surface layer - nearly opaque to show height clearly
    const topSurfaceLayer = useMemo(() => {
        if (topSurfaceData.length === 0) return null;

        const fillColor = getThemeColor(THEME_PRIMARY, 220);
        const edgeColor = getThemeColor(THEME_PRIMARY, 255);

        return new SolidPolygonLayer({
            id: VOLUME_MEASURE_TIN_LAYER_ID,
            data: topSurfaceData,
            getPolygon: (d: [number, number, number][]) => d,
            getFillColor: fillColor,
            getLineColor: edgeColor,
            getLineWidth: 2,
            lineWidthUnits: "pixels",
            coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
            pickable: false,
        });
    }, [topSurfaceData]);

    // Manage deck.gl layers
    useEffect(() => {
        if (!overlayManager.isAttached()) return;

        const layers = [
            { id: VOLUME_MEASURE_POLYGON_LAYER_ID, layer: polygonLayer },
            {
                id: VOLUME_MEASURE_POINTS_LAYER_ID,
                layer: boundaryPointsLayer,
            },
            {
                id: VOLUME_MEASURE_PREVIEW_POINT_LAYER_ID,
                layer: previewPointLayer,
            },
            {
                id: VOLUME_MEASURE_PREVIEW_LINE_LAYER_ID,
                layer: previewLineLayer,
            },
            {
                id: VOLUME_MEASURE_TIN_LAYER_ID,
                layer: topSurfaceLayer,
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
        polygonLayer,
        boundaryPointsLayer,
        previewPointLayer,
        previewLineLayer,
        topSurfaceLayer,
    ]);

    // Render UI
    return (
        <ToolPanel
            title={dict["eyebrow"]}
            hint={isComplete ? dict["hint.complete"] : dict["hint.normal"]}
            actions={
                <>
                    <button
                        type="button"
                        className={toolStyles.button}
                        disabled={boundary.length === 0}
                        onClick={() => {
                            setBoundary([]);
                            setIsComplete(false);
                            setInsidePoints([]);
                        }}
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
            {isComplete && (
                <div className={styles.measurementSummary}>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>
                            {dict["summary.volume"]}
                        </span>
                        <span className={styles.summaryValue}>
                            {formatVolume(volumeMeasurements.volumeCubicMeters)}
                        </span>
                    </div>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>
                            {dict["summary.surfaceArea"]}
                        </span>
                        <span className={styles.summaryValue}>
                            {formatDistance(
                                Math.sqrt(
                                    volumeMeasurements.surfaceAreaSquareMeters,
                                ),
                            )}
                        </span>
                    </div>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>
                            {dict["summary.baseZ"]}
                        </span>
                        <span className={styles.summaryValue}>
                            {volumeMeasurements.baseZMin.toFixed(1)} —{" "}
                            {volumeMeasurements.baseZMax.toFixed(1)} m
                        </span>
                    </div>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>
                            {dict["summary.surfaceZ"]}
                        </span>
                        <span className={styles.summaryValue}>
                            {volumeMeasurements.surfaceZMin.toFixed(1)} —{" "}
                            {volumeMeasurements.surfaceZMax.toFixed(1)} m
                        </span>
                    </div>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>
                            {dict["summary.cloudPoints"]}
                        </span>
                        <span className={styles.summaryValue}>
                            {volumeMeasurements.cloudPointCount}
                        </span>
                    </div>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>
                            {dict["summary.gridCells"]}
                        </span>
                        <span className={styles.summaryValue}>
                            {volumeMeasurements.gridCellCount} /{" "}
                            {volumeMeasurements.totalGridCells}
                        </span>
                    </div>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>
                            {dict["summary.cellSize"]}
                        </span>
                        <span className={styles.summaryValue}>
                            {volumeMeasurements.gridResolution.toFixed(1)} m
                        </span>
                    </div>
                </div>
            )}
        </ToolPanel>
    );
});

export default VolumeMeasureComponent;
