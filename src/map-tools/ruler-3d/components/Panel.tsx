import React, { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { geodesicDistance } from "@core/shared/geo";
import {
    formatDistance,
    convertPointToDegrees,
} from "@core/shared/geo/formatters";
import {
    getThemeColor,
    THEME_PRIMARY,
    THEME_SECONDARY,
    THEME_SUCCESS,
    COLOR_ALPHA_STROKE,
    COLOR_ALPHA_PREVIEW,
} from "@core/shared/ui";
import { formatDict } from "@core/framework/i18n";
import { useMeasureInteraction } from "@map-tools/shared/useMeasureInteraction";
import { useOverlayLayers } from "@core/framework/hooks";

import type { MapToolComponentProps } from "@core/framework/types";
import type { MeasureToolStore } from "@map-tools/shared/MeasureToolStore";
import { ToolPanel, SegmentsList } from "@core/ui/composites";
import type { Segment } from "@core/ui/composites";
import { PathLayer, ScatterplotLayer, LineLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import type { Point3D, SegmentDistance3D } from "../types";

import styles from "@core/ui/composites/measurement-panel/MeasurementPanel.module.css";
import toolStyles from "@core/ui/composites/tool-panel/ToolPanel.module.css";

export type { Point3D, SegmentDistance3D } from "../types";

const LAYER_PREFIX = "ruler-3d-";
const POINTS_LAYER_ID = "ruler-3d-points";
const PATH_LAYER_ID = "ruler-3d-path";
const PREVIEW_POINT_LAYER_ID = "ruler-3d-preview-point";
const PREVIEW_LINE_LAYER_ID = "ruler-3d-preview-line";

function euclidean3D(p1: Point3D, p2: Point3D): number {
    const h = geodesicDistance([p1.lng, p1.lat], [p2.lng, p2.lat]);
    return Math.sqrt(h * h + (p2.z - p1.z) ** 2);
}

function horizontalDist(p1: Point3D, p2: Point3D): number {
    return geodesicDistance([p1.lng, p1.lat], [p2.lng, p2.lat]);
}

function verticalDist(p1: Point3D, p2: Point3D): number {
    return Math.abs(p2.z - p1.z);
}

export const Ruler3DComponent: (
    props: MapToolComponentProps & { store: MeasureToolStore },
) => React.ReactNode = observer(
    ({ map, deactivate, rootStore, overlayManager, store }) => {
        const dict = rootStore.localeStore.t("ruler-3d");
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

        // ---- distance calculations ----
        const { segments, totalDistance, totalHorizontal, totalVertical } =
            useMemo(() => {
                const segs: SegmentDistance3D[] = [];
                for (let i = 1; i < store.points.length; i++) {
                    const from = store.points[i - 1]!;
                    const to = store.points[i]!;
                    segs.push({
                        from,
                        to,
                        distanceMeters: euclidean3D(from, to),
                        horizontalDistance: horizontalDist(from, to),
                        verticalDistance: verticalDist(from, to),
                    });
                }
                return {
                    segments: segs,
                    totalDistance: segs.reduce(
                        (s, seg) => s + seg.distanceMeters,
                        0,
                    ),
                    totalHorizontal: segs.reduce(
                        (s, seg) => s + seg.horizontalDistance,
                        0,
                    ),
                    totalVertical: segs.reduce(
                        (s, seg) => s + seg.verticalDistance,
                        0,
                    ),
                };
            }, [store.points]);

        // ---- Deck.gl layers ----
        const pointsData = useMemo(
            () =>
                store.points.map((p, i) => ({
                    position: convertPointToDegrees(p),
                    index: i,
                })),
            [store.points],
        );

        const pathLayer = useMemo(() => {
            if (store.points.length < 2) return null;
            const color = getThemeColor(THEME_PRIMARY, COLOR_ALPHA_STROKE);
            return new PathLayer({
                id: PATH_LAYER_ID,
                data: [store.points.map((p) => convertPointToDegrees(p))],
                getPath: (d: [number, number, number][]) => d,
                getColor: color,
                getWidth: 4,
                widthUnits: "pixels",
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
                pickable: false,
                capRounded: true,
                jointRounded: true,
                widthMinPixels: 2,
                widthMaxPixels: 8,
            });
        }, [store.points]);

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
            const color = getThemeColor(THEME_SUCCESS, COLOR_ALPHA_PREVIEW);
            return new ScatterplotLayer({
                id: PREVIEW_POINT_LAYER_ID,
                data: [{ position: convertPointToDegrees(store.previewPoint) }],
                getPosition: (d: { position: [number, number, number] }) =>
                    d.position,
                getRadius: 6,
                getFillColor: color,
                radiusUnits: "pixels",
                pickable: false,
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
            });
        }, [store.previewPoint]);

        const previewLineLayer = useMemo(() => {
            if (!store.previewPoint || store.points.length === 0) return null;
            const last = store.points[store.points.length - 1]!;
            const color = getThemeColor(THEME_SUCCESS, COLOR_ALPHA_PREVIEW);
            return new LineLayer({
                id: PREVIEW_LINE_LAYER_ID,
                data: [
                    [
                        convertPointToDegrees(last),
                        convertPointToDegrees(store.previewPoint),
                    ],
                ],
                getPath: (d: unknown) => d as [number, number, number][],
                getColor: color,
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
                        [PATH_LAYER_ID, pathLayer],
                        [POINTS_LAYER_ID, pointsLayer],
                        [PREVIEW_POINT_LAYER_ID, previewPointLayer],
                        [PREVIEW_LINE_LAYER_ID, previewLineLayer],
                    ] as const,
                [pathLayer, pointsLayer, previewPointLayer, previewLineLayer],
            ),
        );

        // ---- UI ----
        const segmentItems: Segment[] = useMemo(
            () =>
                segments.map((seg, i) => ({
                    label: formatDict(dict["segment.label"]!, {
                        from: i + 1,
                        to: i + 2,
                    }),
                    value: formatDistance(seg.distanceMeters),
                    details: [
                        {
                            label: dict["segment.horizontal"]!,
                            value: formatDistance(seg.horizontalDistance),
                        },
                        {
                            label: dict["segment.vertical"]!,
                            value: formatDistance(seg.verticalDistance),
                        },
                    ],
                })),
            [segments, dict],
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
                {store.points.length > 0 && (
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
                                    />
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
                                    />
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
                                {store.points.length}
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
