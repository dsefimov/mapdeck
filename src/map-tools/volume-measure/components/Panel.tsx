import React, { useEffect, useCallback, useMemo } from "react";
import { observer } from "mobx-react-lite";
import maplibregl from "maplibre-gl";
import { pickPointFromCloud } from "@core/domain/point-cloud/picking";
import {
    convertPointToDegrees,
    formatDistance,
} from "@core/shared/geo/formatters";
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
import { useOverlayLayers } from "@core/framework/hooks";
import type { LayerAdapterFactory } from "@core/domain/adapters";
import { PointCloudAdapter } from "@core/domain/adapters/layer/impl/PointCloudAdapter";
import { LayerRoles } from "@core/framework/types";

import type {
    MapToolComponentProps,
    MeasurementPoint3D,
    PointCloudData,
} from "@core/framework/types";
import type { VolumeMeasureStore } from "../store/VolumeMeasureStore";

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

const LAYER_PREFIX = "volume-measure-";
const POLYGON_LAYER_ID = "volume-measure-polygon";
const POINTS_LAYER_ID = "volume-measure-points";
const PREVIEW_POINT_LAYER_ID = "volume-measure-preview-point";
const PREVIEW_LINE_LAYER_ID = "volume-measure-preview-line";
const TIN_LAYER_ID = "volume-measure-tin";

const MAX_DELAUNAY_POINTS = 5000;

// ---- Pure utilities (can be moved to core later) ----

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
        if (
            isPointInBoundingBox(pt2D, bbox) &&
            isPointInPolygon(pt2D, polygon2D)
        ) {
            result.push(pt);
        }
    }
    return result;
}

function extractPointsFromCloudData(
    data: PointCloudData,
): MeasurementPoint3D[] {
    const points: MeasurementPoint3D[] = [];
    const origin = data.coordinateOrigin;
    const positions = data.positions;
    for (let i = 0; i < data.pointCount; i++) {
        const base = i * 3;
        points.push({
            lng: origin[0] + positions[base]!,
            lat: origin[1] + positions[base + 1]!,
            z: positions[base + 2]!,
        });
    }
    return points;
}

function getAllLoadedCloudPoints(
    adapterFactory: LayerAdapterFactory,
): MeasurementPoint3D[] {
    if (!adapterFactory.has(LayerRoles.POINT_CLOUD)) return [];
    const adapter = adapterFactory.get(LayerRoles.POINT_CLOUD);
    const pcAdapter = adapter as PointCloudAdapter;
    const allPoints: MeasurementPoint3D[] = [];
    for (const data of pcAdapter.getAllLoadedData()) {
        if (data?.positions) {
            for (const pt of extractPointsFromCloudData(data)) {
                allPoints.push(pt);
            }
        }
    }
    return allPoints;
}

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
        if (d <= searchRadiusMeters) nearby.push({ z: cp.z, dist: d });
    }
    if (nearby.length === 0) return null;
    nearby.sort((a, b) => a.dist - b.dist);
    const neighbors = nearby.slice(0, 4);
    let sumWeight = 0,
        sumZ = 0;
    for (const n of neighbors) {
        const w = 1 / (n.dist * n.dist + 0.001);
        sumWeight += w;
        sumZ += n.z * w;
    }
    return sumZ / sumWeight;
}

function buildTopSurfacePolygons(
    insidePoints: MeasurementPoint3D[],
    boundary: MeasurementPoint3D[],
): [number, number, number][][] {
    if (insidePoints.length < 3 || boundary.length < 3) return [];
    const boundary2D: [number, number][] = boundary.map((p) => [p.lng, p.lat]);
    const bbox = polygonBoundingBox(boundary2D);
    const cellSizeMeters = 2.0;
    const searchRadius = 6.0;
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
            const z = interpolateSurfaceZForVis(
                lng,
                lat,
                insidePoints,
                searchRadius,
            );
            if (z === null) continue;
            const h = cellSizeDeg / 2;
            polygons.push([
                [lng - h, lat - h, z],
                [lng + h, lat - h, z],
                [lng + h, lat + h, z],
                [lng - h, lat + h, z],
            ]);
        }
    }
    return polygons;
}

// ---- Component ----

export const VolumeMeasureComponent: (
    props: MapToolComponentProps & { store: VolumeMeasureStore },
) => React.ReactNode = observer(
    ({ map, deactivate, rootStore, overlayManager, store }) => {
        const dict = rootStore.localeStore.t("volume-measure");
        const adapterFactory = rootStore.layerAdapterFactory;

        // When boundary is completed, find points inside
        useEffect(() => {
            if (!store.isComplete || store.boundary.length < 3) {
                store.setInsidePoints([]);
                return;
            }
            const allPoints = getAllLoadedCloudPoints(adapterFactory);
            const filtered = filterPointsInsidePolygon(
                store.boundary,
                allPoints,
            );
            if (filtered.length > MAX_DELAUNAY_POINTS) {
                const step = Math.ceil(filtered.length / MAX_DELAUNAY_POINTS);
                store.setInsidePoints(
                    filtered.filter((_, i) => i % step === 0),
                );
            } else {
                store.setInsidePoints(filtered);
            }
        }, [store.boundary, store.isComplete, adapterFactory]); // eslint-disable-line react-hooks/exhaustive-deps

        // ---- Event handlers ----
        const handleMapClick = useCallback(
            (event: maplibregl.MapMouseEvent) => {
                if (store.isComplete) return;
                const point = pickPointFromCloud({
                    screenX: event.point.x,
                    screenY: event.point.y,
                    adapterFactory,
                    overlayManager,
                    excludeLayerPrefix: LAYER_PREFIX,
                });
                if (point) store.addBoundaryPoint(point);
            },
            [adapterFactory, overlayManager, store],
        );

        const handleMapMouseMove = useCallback(
            (event: maplibregl.MapMouseEvent) => {
                if (!store.isComplete) {
                    const point = pickPointFromCloud({
                        screenX: event.point.x,
                        screenY: event.point.y,
                        adapterFactory,
                        overlayManager,
                        excludeLayerPrefix: LAYER_PREFIX,
                    });
                    store.setPreviewPoint(point);
                }
            },
            [adapterFactory, overlayManager, store],
        );

        const handleMiddleClick = useCallback(
            (event: maplibregl.MapMouseEvent) => {
                if (
                    event.originalEvent instanceof MouseEvent &&
                    event.originalEvent.button === 1
                ) {
                    event.preventDefault();
                    if (!store.isComplete && store.boundary.length >= 3) {
                        store.completeBoundary();
                    }
                }
            },
            [store],
        );

        const handleKeyDown = useCallback(
            (event: KeyboardEvent) => {
                if (event.key === "Escape") {
                    if (store.isComplete) {
                        store.setInsidePoints([]);
                        store.isComplete = false;
                    } else {
                        deactivate();
                    }
                } else if (event.key === "Enter" && !store.isComplete) {
                    event.preventDefault();
                    store.completeBoundary();
                }
            },
            [store, deactivate],
        );

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

        useEffect(() => {
            const canvas = map.getCanvas();
            if (!canvas) return;
            canvas.style.cursor = store.isComplete ? "" : "crosshair";
            return () => {
                canvas.style.cursor = "";
            };
        }, [map, store.isComplete]);

        // ---- Computations ----
        const volumeMeasurements = useMemo(() => {
            if (store.insidePoints.length < 3 || store.boundary.length < 3) {
                return {
                    volumeCubicMeters: 0,
                    surfaceAreaSquareMeters: 0,
                    baseZMin: 0,
                    baseZMax: 0,
                    surfaceZMin: 0,
                    surfaceZMax: 0,
                    cloudPointCount: store.insidePoints.length,
                    gridCellCount: 0,
                    totalGridCells: 0,
                    gridResolution: 0,
                };
            }
            const result = calculateGridTrapezoidVolume(
                store.boundary,
                store.insidePoints,
                {
                    cellSizeMeters: 2.0,
                    searchRadiusMeters: 6.0,
                    surfaceNeighborCount: 4,
                },
            );
            return { ...result, cloudPointCount: store.insidePoints.length };
        }, [store.boundary, store.insidePoints]);

        // ---- Deck.gl layers ----
        const polygonData = useMemo(() => {
            if (store.boundary.length < 2) return null;
            const coords = store.boundary.map((p) => convertPointToDegrees(p));
            if (store.isComplete)
                coords.push(convertPointToDegrees(store.boundary[0]!));
            return [coords];
        }, [store.boundary, store.isComplete]);

        const boundaryPointsData = useMemo(
            () =>
                store.boundary.map((p, i) => ({
                    position: convertPointToDegrees(p),
                    index: i,
                })),
            [store.boundary],
        );

        const topSurfaceData = useMemo(
            () =>
                store.insidePoints.length < 3 || !store.isComplete
                    ? []
                    : buildTopSurfacePolygons(
                          store.insidePoints,
                          store.boundary,
                      ),
            [store.insidePoints, store.isComplete, store.boundary],
        );

        const polygonLayer = useMemo(() => {
            if (!polygonData) return null;
            return new PolygonLayer({
                id: POLYGON_LAYER_ID,
                data: polygonData,
                getPolygon: (d: [number, number, number][]) => d,
                getFillColor: store.isComplete
                    ? getThemeColor(THEME_PRIMARY, COLOR_ALPHA_FILL)
                    : [0, 0, 0, 0],
                getLineColor: getThemeColor(THEME_PRIMARY, COLOR_ALPHA_STROKE),
                getLineWidth: 3,
                lineWidthUnits: "pixels",
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
                pickable: false,
                lineJointRounded: true,
            });
        }, [polygonData, store.isComplete]);

        const boundaryPointsLayer = useMemo(() => {
            if (boundaryPointsData.length === 0) return null;
            return new ScatterplotLayer({
                id: POINTS_LAYER_ID,
                data: boundaryPointsData,
                getPosition: (d: { position: [number, number, number] }) =>
                    d.position,
                getRadius: 6,
                getFillColor: getThemeColor(THEME_PRIMARY, COLOR_ALPHA_STROKE),
                radiusUnits: "pixels",
                pickable: true,
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
                radiusMinPixels: 4,
                radiusMaxPixels: 10,
            });
        }, [boundaryPointsData]);

        const previewPointLayer = useMemo(() => {
            if (!store.previewPoint) return null;
            return new ScatterplotLayer({
                id: PREVIEW_POINT_LAYER_ID,
                data: [{ position: convertPointToDegrees(store.previewPoint) }],
                getPosition: (d: { position: [number, number, number] }) =>
                    d.position,
                getRadius: 6,
                getFillColor: getThemeColor(THEME_SUCCESS, COLOR_ALPHA_PREVIEW),
                radiusUnits: "pixels",
                pickable: false,
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
            });
        }, [store.previewPoint]);

        const previewLineLayer = useMemo(() => {
            if (!store.previewPoint || store.boundary.length === 0) return null;
            const last = store.boundary[store.boundary.length - 1]!;
            return new LineLayer({
                id: PREVIEW_LINE_LAYER_ID,
                data: [
                    [
                        convertPointToDegrees(last),
                        convertPointToDegrees(store.previewPoint),
                    ],
                ],
                getPath: (d: unknown) => d as [number, number, number][],
                getColor: getThemeColor(THEME_SUCCESS, COLOR_ALPHA_PREVIEW),
                getWidth: 2,
                widthUnits: "pixels",
                pickable: false,
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
            });
        }, [store.previewPoint, store.boundary]);

        const topSurfaceLayer = useMemo(() => {
            if (topSurfaceData.length === 0) return null;
            return new SolidPolygonLayer({
                id: TIN_LAYER_ID,
                data: topSurfaceData,
                getPolygon: (d: [number, number, number][]) => d,
                getFillColor: getThemeColor(THEME_PRIMARY, 220),
                getLineColor: getThemeColor(THEME_PRIMARY, 255),
                getLineWidth: 2,
                lineWidthUnits: "pixels",
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
                pickable: false,
            });
        }, [topSurfaceData]);

        // ---- overlay lifecycle ----
        useOverlayLayers(
            overlayManager,
            useMemo(
                () =>
                    [
                        [POLYGON_LAYER_ID, polygonLayer],
                        [POINTS_LAYER_ID, boundaryPointsLayer],
                        [PREVIEW_POINT_LAYER_ID, previewPointLayer],
                        [PREVIEW_LINE_LAYER_ID, previewLineLayer],
                        [TIN_LAYER_ID, topSurfaceLayer],
                    ] as const,
                [
                    polygonLayer,
                    boundaryPointsLayer,
                    previewPointLayer,
                    previewLineLayer,
                    topSurfaceLayer,
                ],
            ),
        );

        // ---- UI ----
        return (
            <ToolPanel
                title={dict["eyebrow"]}
                hint={
                    store.isComplete
                        ? dict["hint.complete"]
                        : dict["hint.normal"]
                }
                actions={
                    <>
                        <button
                            type="button"
                            className={toolStyles.button}
                            disabled={store.boundary.length === 0}
                            onClick={() => store.reset()}
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
                {store.isComplete && (
                    <div className={styles.measurementSummary}>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryLabel}>
                                {dict["summary.volume"]}
                            </span>
                            <span className={styles.summaryValue}>
                                {formatVolume(
                                    volumeMeasurements.volumeCubicMeters,
                                )}
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
    },
);

export default VolumeMeasureComponent;
