import React, { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { geodesicDistance } from "@core/shared/geo";
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
import { useMeasureInteraction } from "@map-tools/shared/useMeasureInteraction";
import { useOverlayLayers } from "@core/framework/hooks";
import area from "@turf/area";
import { polygon } from "@turf/helpers";

import type {
    MapToolComponentProps,
    MeasurementPoint3D,
} from "@core/framework/types";
import type { MeasureToolStore } from "@map-tools/shared/MeasureToolStore";
import { ToolPanel, SegmentsList } from "@core/ui/composites";
import type { Segment } from "@core/ui/composites";
import { PolygonLayer, ScatterplotLayer, LineLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import type { PolygonEdge, AreaMeasurements } from "../types";

import styles from "@core/ui/composites/measurement-panel/MeasurementPanel.module.css";
import toolStyles from "@core/ui/composites/tool-panel/ToolPanel.module.css";

const LAYER_PREFIX = "area-measure-";
const POLYGON_LAYER_ID = "area-measure-polygon";
const POINTS_LAYER_ID = "area-measure-points";
const PREVIEW_POINT_LAYER_ID = "area-measure-preview-point";
const PREVIEW_LINE_LAYER_ID = "area-measure-preview-line";

function calculateArea2D(points: MeasurementPoint3D[]): number {
    if (points.length < 3) return 0;
    const coords = points.map((p) => [p.lng, p.lat]);
    coords.push([points[0]!.lng, points[0]!.lat]);
    return area(polygon([coords]));
}

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

export const AreaMeasureComponent: (
    props: MapToolComponentProps & { store: MeasureToolStore },
) => React.ReactNode = observer(
    ({ map, deactivate, rootStore, overlayManager, store }) => {
        const dict = rootStore.localeStore.t("area-measure");
        const adapterFactory = rootStore.layerAdapterFactory;

        useMeasureInteraction({
            map,
            overlayManager,
            adapterFactory,
            store,
            layerPrefix: LAYER_PREFIX,
            pointsLayerId: POINTS_LAYER_ID,
            onDeactivate: deactivate,
        });

        // ---- measurements ----
        const measurements: AreaMeasurements = useMemo(() => {
            const edges: PolygonEdge[] = [];
            for (let i = 1; i < store.points.length; i++) {
                const from = store.points[i - 1]!;
                const to = store.points[i]!;
                edges.push({
                    from,
                    to,
                    distanceMeters: geodesicDistance(
                        [from.lng, from.lat],
                        [to.lng, to.lat],
                    ),
                });
            }
            return {
                areaSquareMeters: calculateArea2D(store.points),
                perimeterMeters: calculatePerimeter(store.points),
                edges,
                vertexCount: store.points.length,
            };
        }, [store.points]);

        // ---- Deck.gl layers ----
        const polygonData = useMemo(() => {
            if (store.points.length < 3) return null;
            const coords = store.points.map((p) => convertPointToDegrees(p));
            coords.push(convertPointToDegrees(store.points[0]!));
            return [coords];
        }, [store.points]);

        const pointsData = useMemo(
            () =>
                store.points.map((p, i) => ({
                    position: convertPointToDegrees(p),
                    index: i,
                })),
            [store.points],
        );

        const polygonLayer = useMemo(() => {
            if (!polygonData) return null;
            return new PolygonLayer({
                id: POLYGON_LAYER_ID,
                data: polygonData,
                getPolygon: (d: [number, number, number][]) => d,
                getFillColor: getThemeColor(THEME_PRIMARY, COLOR_ALPHA_FILL),
                getLineColor: getThemeColor(THEME_PRIMARY, COLOR_ALPHA_STROKE),
                getLineWidth: 3,
                lineWidthUnits: "pixels",
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
                pickable: false,
                lineJointRounded: true,
            });
        }, [polygonData]);

        const pointsLayer = useMemo(() => {
            if (pointsData.length === 0) return null;
            const color = getThemeColor(
                store.editMode ? THEME_SECONDARY : THEME_PRIMARY,
                COLOR_ALPHA_STROKE,
            );
            return new ScatterplotLayer({
                id: POINTS_LAYER_ID,
                data: pointsData,
                getPosition: (d: { position: [number, number, number] }) =>
                    d.position,
                getRadius: 6,
                getFillColor: color,
                radiusUnits: "pixels",
                pickable: true,
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
                radiusMinPixels: 4,
                radiusMaxPixels: 10,
            });
        }, [pointsData, store.editMode]);

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
            if (!store.previewPoint || store.points.length === 0) return null;
            const last = store.points[store.points.length - 1]!;
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
        }, [store.previewPoint, store.points]);

        // ---- overlay lifecycle ----
        useOverlayLayers(
            overlayManager,
            useMemo(
                () =>
                    [
                        [POLYGON_LAYER_ID, polygonLayer],
                        [POINTS_LAYER_ID, pointsLayer],
                        [PREVIEW_POINT_LAYER_ID, previewPointLayer],
                        [PREVIEW_LINE_LAYER_ID, previewLineLayer],
                    ] as const,
                [
                    polygonLayer,
                    pointsLayer,
                    previewPointLayer,
                    previewLineLayer,
                ],
            ),
        );

        // ---- UI ----
        const segmentItems: Segment[] = useMemo(
            () =>
                measurements.edges.map((edge, i) => ({
                    label: formatDict(dict["segment.label"]!, {
                        from: i + 1,
                        to: i + 2,
                    }),
                    value: formatDistance(edge.distanceMeters),
                })),
            [measurements.edges, dict],
        );

        return (
            <ToolPanel
                title={
                    store.editMode ? dict["eyebrow.editMode"] : dict["eyebrow"]
                }
                hint={
                    store.editMode ? dict["hint.editMode"] : dict["hint.normal"]
                }
                actions={
                    <>
                        <button
                            type="button"
                            className={toolStyles.button}
                            disabled={store.points.length === 0}
                            onClick={() => store.removeLastPoint()}
                        >
                            {dict["button.undo"]}
                        </button>
                        <button
                            type="button"
                            className={toolStyles.button}
                            disabled={store.points.length === 0}
                            onClick={() => store.clearPoints()}
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
                {store.points.length >= 3 && (
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
