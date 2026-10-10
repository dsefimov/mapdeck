import type {
    LayerAdapter,
    MapContext,
    PointCloudDataAdapter,
    RenderDescriptor,
    RenderUnit,
} from "@core/contracts";
import { logger } from "@core/lib/logger";
import { ColorScheme, type PointCloudData } from "@core/contracts";
import type { OverlayManager } from "@core/contracts/domain/map-context";
import type { StreamingLoaderOptions } from "../types";
import {
    DEFAULT_POINT_BUDGET,
    DEFAULT_MAX_SCREEN_ERROR_PX,
    DEFAULT_MAX_OCTREE_DEPTH,
} from "../engine/streamingConfig";
import { createCancellable } from "@core/lib/async";
import { comparer } from "mobx";
import { CopcStreamingLoader } from "../engine/CopcStreamingLoader";
import { ViewportManager } from "../engine/ViewportManager";
import { createPointCloudLayer } from "./PointCloudLayerFactory";
import { createLazPerf } from "laz-perf";

/** Deck layer type through the port — the protocol names no deck import. */
type DeckLayer = Parameters<MapContext["overlayManager"]["addLayer"]>[1];

/** Viewport changes settle this long before a fetch cycle starts. */
const VIEWPORT_DEBOUNCE_MS = 150;

interface PointCloudLayerState {
    loader: CopcStreamingLoader;
    viewportManager: ViewportManager | null;
    initTask: ReturnType<typeof createCancellable>;
    config: Record<string, unknown>;
    data: PointCloudData | null;
    dataVersion: number;
    /** Last visibility applied via updateVisibility — re-applied on every deck re-add. */
    visible: boolean;
}

/**
 * Streaming point cloud adapter for COPC.LAZ format.
 */
export class PointCloudAdapter
    implements LayerAdapter, PointCloudDataAdapter
{
    readonly nativeLayerOrdering = false;

    private static readonly DEFAULT_STREAMING_OPTIONS: StreamingLoaderOptions =
        {
            maxConcurrentRequests: 4,
            maxOctreeDepth: DEFAULT_MAX_OCTREE_DEPTH,
        };

    private _layers = new Map<string, PointCloudLayerState>();

    /**
     * @param lazPerfWasmUrl - Where the LazPerf decoder binary lives.
     *   Page-relative by default so a sub-path deployment resolves it
     *   against its own origin; the composition root may override it from
     *   the deployment's runtime config.
     */
    constructor(private readonly _lazPerfWasmUrl = "laz-perf.wasm") {}

    addToMap(
        layerId: string,
        descriptor: RenderDescriptor,
        ctx: MapContext,
    ): void {
        try {
            if (this._layers.has(layerId)) {
                this.removeFromMap(layerId, ctx);
            }

            const pointCloudConfig = descriptor.config as Record<
                string,
                unknown
            >;
            const sourceRef = descriptor.sourceUrl;

            if (typeof sourceRef !== "string" || !sourceRef.trim()) {
                throw new Error(
                    `PointCloudAdapter: Invalid source URL for layer "${layerId}": ${sourceRef}`,
                );
            }

            const wasmUrl = this._lazPerfWasmUrl;
            const lazPerfPromise = createLazPerf({
                locateFile: (path: string) => {
                    if (path.endsWith(".wasm")) {
                        return wasmUrl;
                    }
                    return path;
                },
            });

            const loader = new CopcStreamingLoader(
                sourceRef,
                PointCloudAdapter.DEFAULT_STREAMING_OPTIONS,
                lazPerfPromise,
            );

            const task = createCancellable();

            const state: PointCloudLayerState = {
                loader,
                viewportManager: null,
                initTask: task,
                config: pointCloudConfig,
                data: null,
                dataVersion: 0,
                visible: true,
            };

            this._layers.set(layerId, state);

            this._initializeLayer(layerId, state, ctx);
        } catch (error) {
            const state = this._layers.get(layerId);
            state?.loader.destroy();
            this._layers.delete(layerId);
            throw error;
        }
    }

    private _initializeLayer(
        layerId: string,
        state: PointCloudLayerState,
        ctx: MapContext,
    ): void {
        const { initTask: task, loader } = state;
        const { map, overlayManager } = ctx;

        task.run(async (signal) => {
            await loader.initialize();
            if (signal.aborted) return;

            loader.setOnPointsLoaded((data: PointCloudData) => {
                state.data = data;
                this._updateDeckLayer(layerId, overlayManager);
            });

            loader.setEffectiveBaseline({
                maxScreenErrorPx: DEFAULT_MAX_SCREEN_ERROR_PX,
                pointBudget: DEFAULT_POINT_BUDGET,
            });

            const viewportManager = new ViewportManager(
                map,
                (...args) => {
                    const [viewport, camera] = args;
                    const viewportBounds: [number, number, number, number] = [
                        viewport.bounds[0],
                        viewport.bounds[1],
                        viewport.bounds[2],
                        viewport.bounds[3],
                    ];
                    loader.selectNodesSSE(camera, viewportBounds);
                },
                {
                    debounceMs: VIEWPORT_DEBOUNCE_MS,
                    provider: {
                        getCameraPosition: () =>
                            ctx.getCameraPosition?.() ?? [0, 0, 0],
                        getFrustumPlanes: () =>
                            ctx.getFrustumPlanes?.() ?? null,
                        getActiveViewport: () =>
                            ctx.getActiveViewport?.() ?? null,
                    },
                    onImmediateChange: (_viewport, camera) => {
                        loader.setCameraSnapshot(camera);
                    },
                },
            );

            state.viewportManager = viewportManager;
            viewportManager.start();
        }).catch((error) => {
            logger.error(
                `PointCloudAdapter: failed to initialize layer "${layerId}":`,
                error,
            );
            state.loader.destroy();
            this._layers.delete(layerId);
            ctx.reportLayerError?.(layerId, error);
        });
    }

    removeFromMap(layerId: string, ctx: MapContext): void {
        const state = this._layers.get(layerId);
        if (!state) return;

        state.initTask.cancel();
        if (state.viewportManager) {
            state.viewportManager.stop();
            state.viewportManager.destroy();
        }
        state.loader.destroy();
        ctx.overlayManager.removeLayer(layerId);

        this._layers.delete(layerId);
    }

    updateVisibility(layerId: string, visible: boolean, ctx: MapContext): void {
        const state = this._layers.get(layerId);
        if (state) state.visible = visible;

        if (visible && state?.data) {
            // Re-create the deck layer from retained data so the re-shown
            // layer actually renders without waiting for a viewport change
            // (re-adding the same layer instance via setProps does not
            // reliably re-render in the interleaved overlay).
            this._updateDeckLayer(layerId, ctx.overlayManager);
        } else {
            ctx.overlayManager.setLayerVisibility(layerId, visible);
        }
    }

    private static readonly VISUAL_FIELDS = new Set([
        "pointSize",
        "colorScheme",
        "opacity",
        "intensityMin",
        "intensityMax",
        "classificationFilter",
        "filterByClassification",
    ]);

    updateConfig(renderUnit: RenderUnit, ctx: MapContext): void {
        const { id: layerId, descriptor } = renderUnit;
        const { config } = descriptor;

        const state = this._layers.get(layerId);
        if (!state) {
            return;
        }

        const prevConfig = state.config;
        state.config = config;

        if (this._canUpdateInPlace(prevConfig, config)) {
            if (prevConfig.colorScheme !== config.colorScheme) {
                state.loader.switchScheme(
                    (config.colorScheme as ColorScheme) ?? ColorScheme.RGB,
                );
            }
            // In-place update instead of destroy+create: keeps in-flight
            // loads alive and avoids the abort cascade. Before the first
            // points arrive there is no deck layer to update — state.config
            // is already stored, so the next data push builds with it.
            if (!state.data) return;

            try {
                const layer = createPointCloudLayer(
                    layerId,
                    state.data,
                    config,
                    state.dataVersion,
                );
                ctx.overlayManager.updateLayer(
                    layerId,
                    layer.props as Partial<DeckLayer>,
                );
            } catch (error) {
                logger.error(
                    `PointCloudAdapter: failed to apply visual update for layer "${layerId}":`,
                    error,
                );
            }
        } else {
            const wasHidden = state.visible === false;
            this.removeFromMap(layerId, ctx);
            this.addToMap(layerId, descriptor, ctx);
            if (wasHidden) {
                const state = this._layers.get(layerId);
                if (state) state.visible = false;
            }
        }
    }

    private _canUpdateInPlace(
        prevConfig: Record<string, unknown>,
        nextConfig: Record<string, unknown>,
    ): boolean {
        const allKeys = new Set([
            ...Object.keys(prevConfig),
            ...Object.keys(nextConfig),
        ]);

        for (const key of allKeys) {
            if (PointCloudAdapter.VISUAL_FIELDS.has(key)) continue;
            if (!comparer.structural(prevConfig[key], nextConfig[key])) {
                return false;
            }
        }

        return true;
    }

    private _updateDeckLayer(
        layerId: string,
        overlayManager: OverlayManager<DeckLayer>,
    ): void {
        const state = this._layers.get(layerId);
        if (!state) return;

        const { config, data, dataVersion } = state;

        if (!data) {
            return;
        }

        try {
            state.dataVersion = dataVersion + 1;

            const layer = createPointCloudLayer(
                layerId,
                data,
                config,
                state.dataVersion,
            );

            overlayManager.addLayer(layerId, layer);

            this._applyRetainedVisibility(
                layerId,
                state.visible,
                overlayManager,
            );
        } catch (error) {
            logger.error(
                `PointCloudAdapter: failed to add deck layer "${layerId}":`,
                error,
            );
        }
    }

    /**
     * Deck layers are created visible; a hidden unit keeps streaming, so
     * the retained visibility is restored on every re-add.
     */
    private _applyRetainedVisibility(
        layerId: string,
        visible: boolean,
        overlayManager: OverlayManager<DeckLayer>,
    ): void {
        if (!visible) {
            overlayManager.setLayerVisibility(layerId, false);
        }
    }

    dispose(): void {
        for (const [layerId, state] of this._layers) {
            try {
                state.initTask.cancel();
                if (state.viewportManager) {
                    state.viewportManager.destroy();
                }
                state.loader.destroy();
            } catch (error) {
                logger.warn(
                    `PointCloudAdapter: failed to dispose layer "${layerId}":`,
                    error,
                );
            }
        }
        this._layers.clear();
    }

    getLoadedData(layerId: string): PointCloudData | undefined {
        return this._layers.get(layerId)?.data ?? undefined;
    }

    /**
     * Get all loaded point cloud data across all layers managed by this adapter.
     */
    getAllLoadedData(): PointCloudData[] {
        const result: PointCloudData[] = [];
        for (const state of this._layers.values()) {
            if (state.data) {
                result.push(state.data);
            }
        }
        return result;
    }
}
