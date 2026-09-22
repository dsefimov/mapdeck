import React from "react";
import { observer } from "mobx-react-lite";
import type { MapToolComponentProps } from "@core/contracts";
import { useMapCursor } from "@core/ui/hooks";
import { ToolPanel, SegmentsList, SummarySection } from "@core/ui/composites";
import { Button } from "@core/ui/components";
import type { Segment, SummaryItem } from "@core/ui/composites";
import { useOverlayLayers } from "@core/domain/map";
import { useAttachedController, measureCursor, type MeasureController } from "./MeasureController";
import { useTechLayers } from "./useTechLayers";
import { usePointCloudData } from "./usePointCloudData";

/**
 * The measure panels' shared shell (ADR-0002 case-2): controller wiring,
 * cursor, tech layers, the ToolPanel frame with the standard
 * undo/reset/close actions, and the summary + segments layout. The tool's
 * panel computes its measurements and passes the items; everything else
 * lives here.
 */
/**
 * Keys the shared measure shell reads from a tool's namespace dictionary.
 * A tool dict typed `Record<ToolLocaleKey, string>` must carry all of them —
 * the compiler checks the hand-off at the panel call site.
 */
export type MeasurePanelDict = {
    readonly eyebrow: string;
    readonly "eyebrow.editMode": string;
    readonly "hint.normal": string;
    readonly "hint.editMode": string;
    readonly "button.undo": string;
    readonly "button.resetAll": string;
    readonly "button.closeTool": string;
    readonly "segments.title": string;
};

export interface MeasurePanelProps {
    readonly controller: MeasureController;
    readonly props: MapToolComponentProps;
    /** Overlay layer id prefix — the tool's own id constant. */
    readonly layerPrefix: string;
    readonly dict: MeasurePanelDict;
    /** Points of the active drawing — drives the action buttons' disabled. */
    readonly pointCount: number;
    /** Whether the summary shows (each tool has its own minimum). */
    readonly showSummary: boolean;
    readonly summaryItems: SummaryItem[];
    readonly segmentItems: Segment[];
}

export const MeasurePanel: (
    props: MeasurePanelProps,
) => React.ReactNode = observer(
    ({
        controller,
        props,
        layerPrefix,
        dict,
        pointCount,
        showSummary,
        summaryItems,
        segmentItems,
    }) => {
        const { map, deactivate, context, overlayManager } = props;
        const store = controller.store;

        const getPointCloudData = usePointCloudData(context);

        useAttachedController(controller, {
            map,
            overlayManager,
            getPointCloudData,
            onEscape: deactivate,
        });
        useMapCursor(map, measureCursor(store.draggingIndex, store.editMode));
        useOverlayLayers(overlayManager, useTechLayers(store, layerPrefix));

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
                        <Button
                            fullWidth
                            disabled={pointCount === 0}
                            onClick={() => store.removeLastPoint()}
                        >
                            {dict["button.undo"]}
                        </Button>
                        <Button
                            fullWidth
                            disabled={pointCount === 0}
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
                {showSummary && <SummarySection items={summaryItems} />}
                {segmentItems.length > 0 && (
                    <SegmentsList
                        title={dict["segments.title"]}
                        segments={segmentItems}
                    />
                )}
            </ToolPanel>
        );
    },
);
