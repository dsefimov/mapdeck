import type maplibregl from "maplibre-gl";
import type { Layer } from "@deck.gl/core";
import type { OverlayManager } from "@core/contracts/domain/map-context";
import type { ToolRuntimeContext } from "@core/contracts";
import { logger } from "@core/lib/logger";
import { findBboxProblem, type Bbox } from "@core/lib/geo";
import type { SelectionRecord, SelectionStore } from "@core/common/selection";
import type { SelectionToolStore } from "./SelectionToolStore";
import { recordFromDeckPick, recordFromNativeFeature } from "./pickedFeature";

/** Everything the controller needs from the panel's environment. */
export interface SelectionControllerDeps {
    readonly map: maplibregl.Map;
    readonly context: ToolRuntimeContext;
    readonly overlayManager: OverlayManager<Layer>;
    /** Observable session state — target layer, mode, drag preview. */
    readonly toolStore: SelectionToolStore;
    /** The shared per-layer selection. */
    readonly selection: SelectionStore;
}

/** Below this travel a drag counts as a click, not a rectangle. */
const CLICK_THRESHOLD_PX = 3;

/** Deck picks widen a point slightly, as feature-info does. */
const PICK_RADIUS_PX = 5;

/** Keep a fitted selection off the viewport edges and below street level. */
const FIT_BOUNDS_PADDING_PX = 20;
const FIT_BOUNDS_MAX_ZOOM = 18;

/** One finished pointer gesture: a point, or a point plus its rectangle. */
interface PickQuery {
    x: number;
    y: number;
    rect: { x0: number; y0: number; x1: number; y1: number } | null;
}

/** Whether a picked deck layer id belongs to the target layer node. */
function belongsToTarget(pickedLayerId: string, targetLayerId: string): boolean {
    // Render units suffix their layers ("{id}-suffix"), so the prefix
    // must end at a boundary — a raw startsWith would also match an id
    // that is merely a string prefix of another layer's id.
    return (
        pickedLayerId === targetLayerId ||
        (pickedLayerId.length > targetLayerId.length &&
            pickedLayerId.startsWith(targetLayerId) &&
            pickedLayerId[targetLayerId.length] === "-")
    );
}

/**
 * Interaction orchestration of the selection tool: left-click picks the
 * target layer's feature under the cursor, a left-drag selects everything
 * inside the rectangle. The map's own drag-pan is suspended while the
 * tool is active — the drag belongs to the selection. The panel is a
 * thin observer; combining the picks with the store is the tool's mode
 * (new/add/remove), not keyboard state.
 */
export class SelectionController {
    private deps: SelectionControllerDeps | null = null;
    private startPoint: { x: number; y: number } | null = null;

    attach(deps: SelectionControllerDeps): void {
        this.detach();
        this.deps = deps;

        deps.map.on("mousedown", this.handleMouseDown);
        deps.map.on("mousemove", this.handleMouseMove);
        deps.map.on("mouseup", this.handleMouseUp);
        deps.map.dragPan.disable();
    }

    /** Unwires everything attach wired — safe to call twice. */
    detach(): void {
        const deps = this.deps;
        if (!deps) return;

        deps.map.off("mousedown", this.handleMouseDown);
        deps.map.off("mousemove", this.handleMouseMove);
        deps.map.off("mouseup", this.handleMouseUp);
        deps.map.dragPan.enable();
        deps.toolStore.setDragRect(null);
        this.startPoint = null;
        this.deps = null;
    }

    /** Fits the map to a layer selection's extent (the panel's zoom button). */
    zoomToExtent(bbox: Bbox): void {
        const map = this.deps?.map;
        if (!map) return;
        const problem = findBboxProblem(bbox);
        if (problem) {
            logger.warn(`SelectionController: invalid extent (${problem})`);
            return;
        }
        map.fitBounds(
            [
                [bbox.west, bbox.south],
                [bbox.east, bbox.north],
            ],
            { padding: FIT_BOUNDS_PADDING_PX, maxZoom: FIT_BOUNDS_MAX_ZOOM },
        );
    }

    private handleMouseDown = (event: maplibregl.MapMouseEvent): void => {
        if (event.originalEvent.button !== 0) return;
        this.startPoint = { x: event.point.x, y: event.point.y };
    };

    private handleMouseMove = (event: maplibregl.MapMouseEvent): void => {
        const start = this.startPoint;
        if (!start) return;
        this.deps?.toolStore.setDragRect({
            x0: start.x,
            y0: start.y,
            x1: event.point.x,
            y1: event.point.y,
        });
    };

    private handleMouseUp = (event: maplibregl.MapMouseEvent): void => {
        const start = this.startPoint;
        if (!start) return;
        this.startPoint = null;
        this.deps?.toolStore.setDragRect(null);

        const dx = event.point.x - start.x;
        const dy = event.point.y - start.y;
        const rect: PickQuery["rect"] =
            Math.hypot(dx, dy) >= CLICK_THRESHOLD_PX
                ? {
                      x0: Math.min(start.x, event.point.x),
                      y0: Math.min(start.y, event.point.y),
                      x1: Math.max(start.x, event.point.x),
                      y1: Math.max(start.y, event.point.y),
                  }
                : null;
        this.pick({ x: start.x, y: start.y, rect });
    }

    private pick(query: PickQuery): void {
        const deps = this.deps;
        const target = deps?.toolStore.targetLayerId;
        if (!deps || !target) return;

        const node = deps.context.layerTree.allLayerNodes.find(
            (n) => n.id === target,
        );
        if (!node?.isVisible) return;

        const records = this.collectRecords(deps, target, query);

        deps.selection.applySelection(target, records, deps.toolStore.mode);
        if (records.length > 0) {
            deps.selection.markStableIds(
                target,
                records.some((record) => record.key.startsWith("feature-")),
            );
        }
    }

    private collectRecords(
        deps: SelectionControllerDeps,
        target: string,
        query: PickQuery,
    ): SelectionRecord[] {
        // Both channels are queried and merged: a layer renders through
        // exactly one pipeline, but the pipelines are indistinguishable
        // from here — deck's interleaved layers register as internal
        // maplibre layers too, so `map.getLayer` cannot decide. The
        // channels are disjoint, so the union needs no tie-breaking.
        const records = [
            ...this.collectNativeRecords(deps, target, query),
            ...this.collectDeckRecords(deps, target, query),
        ];
        const seen = new Set<string>();
        return records.filter((record) => {
            if (seen.has(record.key)) return false;
            seen.add(record.key);
            return true;
        });
    }

    private collectNativeRecords(
        deps: SelectionControllerDeps,
        target: string,
        query: PickQuery,
    ): SelectionRecord[] {
        const { x, y, rect } = query;
        const area = rect
            ? ([[rect.x0, rect.y0], [rect.x1, rect.y1]] as [
                  [number, number],
                  [number, number],
              ])
            : ([x, y] as [number, number]);
        try {
            const features = deps.map.queryRenderedFeatures(area, {
                layers: [target],
            });
            return features.map((feature, index) =>
                recordFromNativeFeature(feature, index),
            );
        } catch (error) {
            // maplibre throws when options.layers names an id missing
            // from the style — a visible node can race its layer's
            // addition; an empty result is the honest answer then.
            logger.debug(
                `SelectionController: native query missed "${target}"`,
                error,
            );
            return [];
        }
    }

    private collectDeckRecords(
        deps: SelectionControllerDeps,
        target: string,
        query: PickQuery,
    ): SelectionRecord[] {
        const { x, y, rect } = query;
        const picks = rect
            ? deps.overlayManager.pickObjects(rect.x0, rect.y0, undefined, {
                  width: rect.x1 - rect.x0,
                  height: rect.y1 - rect.y0,
              })
            : deps.overlayManager.pickObjects(x, y, PICK_RADIUS_PX);

        const records: SelectionRecord[] = [];
        const seen = new Set<string>();
        for (const info of picks) {
            const layerId = info.layer?.id;
            if (!layerId || !belongsToTarget(layerId, target)) continue;
            const record = recordFromDeckPick(info);
            if (!record || seen.has(record.key)) continue;
            seen.add(record.key);
            records.push(record);
        }
        return records;
    }
}
