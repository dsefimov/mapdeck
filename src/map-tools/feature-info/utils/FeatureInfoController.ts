import { reaction } from "mobx";
import maplibregl from "maplibre-gl";
import type { Layer } from "@deck.gl/core";
import { logger } from "@core/lib/logger";
import type { LayerNode, ToolRuntimeContext } from "@core/contracts";
import type { OverlayManager } from "@core/contracts/domain/map-context";
import { FeatureCollector, type CollectResult } from "./FeatureCollector";
import type { FeatureInfoStore } from "./FeatureInfoStore";
import {
    showClickMarker,
    removeClickMarker,
} from "./clickMarker";

/** Everything the controller needs from the panel's environment. */
export interface FeatureInfoAttachDeps {
    readonly map: maplibregl.Map;
    readonly context: ToolRuntimeContext;
    readonly overlayManager: OverlayManager<Layer>;
    /** Observable session state — results outlive the component. */
    readonly store: FeatureInfoStore;
}

/**
 * Interaction orchestration of the feature-info tool (ADR-0002 case-2):
 * map click handling, the pending-point reaction, supersede-abort of
 * in-flight collections, and the click marker's lifetime. The panel is a
 * thin observer; session state lives in FeatureInfoStore.
 */
export class FeatureInfoController {
    private deps: FeatureInfoAttachDeps | null = null;
    private abort: AbortController | null = null;
    private disposePending: (() => void) | null = null;

    attach(deps: FeatureInfoAttachDeps): void {
        this.detach();
        this.deps = deps;

        deps.map.on("click", this.handleMapClick);
        this.disposePending = reaction(
            () => deps.context.mapToolState.pendingPoint,
            (pending) => {
                if (!pending) return;
                const point = deps.context.mapToolState.consumePendingPoint();
                if (!point) return;
                this.triggerCollection(
                    new maplibregl.LngLat(point.lngLat.lng, point.lngLat.lat),
                    point.screenPoint,
                );
            },
            { fireImmediately: true },
        );
    }

    /** Unwires everything attach wired — safe to call twice. */
    detach(): void {
        const deps = this.deps;
        if (!deps) return;

        deps.map.off("click", this.handleMapClick);
        removeClickMarker(deps.overlayManager);
        this.abort?.abort();
        this.abort = null;
        this.disposePending?.();
        this.disposePending = null;
        this.deps = null;
    }

    private handleMapClick = (event: maplibregl.MapMouseEvent): void => {
        this.triggerCollection(event.lngLat, {
            x: event.point.x,
            y: event.point.y,
        });
    };

    private triggerCollection(
        lngLat: maplibregl.LngLat,
        screenPoint: { x: number; y: number },
    ): void {
        const deps = this.deps;
        if (!deps) return;

        // A newer click supersedes the in-flight collection outright.
        this.abort?.abort();
        const signal = new AbortController();
        this.abort = signal;

        showClickMarker(
            { lng: lngLat.lng, lat: lngLat.lat },
            deps.overlayManager,
        );
        deps.store.markClicked();
        deps.store.setLoading(true);

        void new FeatureCollector(deps.context.featureProviders)
            .collect(
                {
                    screenX: screenPoint.x,
                    screenY: screenPoint.y,
                    map: deps.map,
                    visibleLayers: visibleLayers(deps),
                    signal: signal.signal,
                },
                (result: CollectResult) => {
                    if (signal.signal.aborted) return;
                    deps.store.setGroups(result.groups);
                    deps.store.setLoading(result.loading);
                },
            )
            .catch((error) => {
                if (!signal.signal.aborted) {
                    logger.error("FeatureInfo: collection failed", error);
                    deps.store.setLoading(false);
                }
            });
    }
}

function visibleLayers(deps: FeatureInfoAttachDeps): LayerNode[] {
    return deps.context.layerTree.allLayerNodes.filter(
        (node) => node.isVisible,
    );
}
