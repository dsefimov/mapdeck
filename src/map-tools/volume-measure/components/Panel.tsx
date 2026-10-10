import React, { useEffect, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { formatArea, formatVolume } from "@core/lib/geo";
import { typedDict } from "@core/lib/text";
import { EMPTY_VOLUME_MEASUREMENTS, type VolumeMeasurements } from "../logic/volume";
import { useOverlayLayers } from "@core/domain/map";
import { useTechLayers } from "@map-tools/shared/useTechLayers";
import { useMeasureColors } from "@core/ui/theme";

import type { MapToolComponentProps } from "@core/contracts";
import { usePointCloudData } from "@map-tools/shared/usePointCloudData";
import { ToolPanel, SummarySection } from "@core/ui/composites";
import { Button } from "@core/ui/components";
import { useMapCursor } from "@core/ui/hooks";
import { SolidPolygonLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import { VolumeMeasureController, VOLUME_LAYER_PREFIX } from "../controller";
import type { VolumeMeasureLocaleKey } from "../locale";

const TIN_LAYER_ID = "volume-measure-tin";

function buildSummaryItems(
    dict: Record<VolumeMeasureLocaleKey, string>,
    measurements: VolumeMeasurements,
    usedCount: number,
    foundCount: number,
): { label: string; value: string }[] {
    const pointsValue =
        foundCount === usedCount
            ? String(foundCount)
            : `${usedCount} / ${foundCount}`;
    return [
        {
            label: dict["summary.fillVolume"],
            value: formatVolume(measurements.fillCubicMeters),
        },
        {
            label: dict["summary.cutVolume"],
            value: formatVolume(measurements.cutCubicMeters),
        },
        {
            label: dict["summary.surfaceArea"],
            value: formatArea(measurements.surfaceAreaSquareMeters),
        },
        {
            label: dict["summary.baseZ"],
            value: `${measurements.baseZMin.toFixed(1)} — ${measurements.baseZMax.toFixed(1)} m`,
        },
        {
            label: dict["summary.surfaceZ"],
            value: `${measurements.surfaceZMin.toFixed(1)} — ${measurements.surfaceZMax.toFixed(1)} m`,
        },
        { label: dict["summary.cloudPoints"], value: pointsValue },
    ];
}

/**
 * Volume measure panel — a thin observer over the
 * {@link VolumeMeasureController}: attach/detach wiring on mount/unmount,
 * the TIN top-surface layer composed over the shared tech layers, and the
 * results summary. All interaction and computation live in the controller.
 */
export const VolumeMeasureComponent: (
    props: MapToolComponentProps & { controller: VolumeMeasureController },
) => React.ReactNode = observer(
    ({ map, deactivate, context, overlayManager, controller }) => {
        const store = controller.store;
        const volume = controller.volume;
        const dict = typedDict<VolumeMeasureLocaleKey>(
            context.locale.t(VOLUME_LAYER_PREFIX),
        );

        const getPointCloudData = usePointCloudData(context);
        const { protocols } = context;

        useEffect(() => {
            controller.attach({
                map,
                overlayManager,
                getPointCloudData,
                protocols,
                onEscape: deactivate,
            });
            return () => controller.detach();
        }, [
            controller,
            map,
            overlayManager,
            getPointCloudData,
            protocols,
            deactivate,
        ]);

        useMapCursor(map, volume.isComplete ? "" : "crosshair");

        const isComplete = volume.isComplete;
        const measurements = volume.measurements ?? EMPTY_VOLUME_MEASUREMENTS;
        const { points: insidePoints, foundCount } = volume.insidePoints;
        const boundary = controller.boundary;

        const colors = useMeasureColors();
        const topSurfaceData = volume.topSurface;
        const topSurfaceLayer = useMemo(() => {
            if (!topSurfaceData || topSurfaceData.length === 0) return null;
            return new SolidPolygonLayer({
                id: TIN_LAYER_ID,
                data: topSurfaceData,
                getPolygon: (d: [number, number, number][]) => d,
                getFillColor: colors.stroke,
                getLineColor: colors.stroke,
                getLineWidth: 2,
                lineWidthUnits: "pixels",
                coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
                pickable: false,
            });
        }, [topSurfaceData, colors]);

        const techLayers = useTechLayers(store, VOLUME_LAYER_PREFIX);
        const layers = useMemo(
            () =>
                [
                    ...techLayers,
                    [TIN_LAYER_ID, topSurfaceLayer],
                ] as const,
            [techLayers, topSurfaceLayer],
        );
        useOverlayLayers(overlayManager, layers);

        return (
            <ToolPanel
                title={dict["eyebrow"]}
                hint={isComplete ? dict["hint.complete"] : dict["hint.normal"]}
                actions={
                    <>
                        <Button
                            fullWidth
                            disabled={boundary.length === 0}
                            onClick={() => controller.reset()}
                        >
                            {dict["button.resetAll"]}
                        </Button>
                        <Button fullWidth onClick={deactivate}>
                            {dict["button.closeTool"]}
                        </Button>
                    </>
                }
            >
                {isComplete && (
                    <SummarySection
                        items={buildSummaryItems(
                            dict,
                            measurements,
                            insidePoints.length,
                            foundCount,
                        )}
                    />
                )}
            </ToolPanel>
        );
    },
);

export default VolumeMeasureComponent;
