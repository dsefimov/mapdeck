import type {
    LayerAdapter,
    MapContext,
    PointCloudLayerConfig,
    RenderUnit,
} from "@core/framework/types";
import { LayerRoles } from "@core/framework/types";
import { isPointCloudConfig, ColorScheme } from "@core/framework/types";
import type { DeckOverlayManager } from "@core/domain/overlay";
import type { Layer } from "@deck.gl/core";
import {
    type PointCloudData,
    type StreamingLoaderOptions,
} from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";
import {
    DEFAULT_POINT_BUDGET,
    DEFAULT_MAX_SCREEN_ERROR_PX,
} from "@core/domain/point-cloud/streamingConfig";
import { createCancellable } from "@core/shared/async";
import { comparer } from "mobx";
import { CopcStreamingLoader } from "@core/domain/point-cloud/CopcStreamingLoader";
import { ViewportManager } from "@core/domain/point-cloud/ViewportManager";
import { PointCloudLayerFactory } from "@core/domain/point-cloud/PointCloudLayerFactory";
import { perfTracker } from "@core/shared/diagnostics/PerfTracker";

interface PointCloudLayerState {
    loader: CopcStreamingLoader;
    viewportManager: ViewportManager | null;
    initTask: ReturnType<typeof createCancellable>;
    config: PointCloudLayerConfig;
    data: PointCloudData | null;
    dataVersion: number;
}

/**
 * Streaming point cloud adapter for COPC.LAZ format.
 * Replaces the old LAS/LAZ adapter with viewport-based streaming.
 */
export class PointCloudAdapter implements LayerAdapter<
    typeof LayerRoles.POINT_CLOUD
> {
    readonly role = LayerRoles.POINT_CLOUD;

    private static readonly DEFAULT_STREAMING_OPTIONS: StreamingLoaderOptions =
        {
            pointBudget: DEFAULT_POINT_BUDGET,
            maxConcurrentRequests: 4,
            viewportDebounceMs: 150,
            maxOctreeDepth: 20,
            maxSubtreesPerViewport: 60,
        };

    private _layers = new Map<string, PointCloudLayerState>();

    addToMap(
        layerId: string,
        descriptor: import("@core/framework/types").RenderDescriptor<
            typeof LayerRoles.POINT_CLOUD
        >,
        ctx: MapContext,
    ): void {
        try {
            if (!isPointCloudConfig(descriptor.config)) {
                throw new Error(
                    `Config is not for point cloud role: ${descriptor.config.role}`,
                );
            }

            if (this._layers.has(layerId)) {
                this.removeFromMap(layerId, ctx);
            }

            const pointCloudConfig = descriptor.config as PointCloudLayerConfig;
            const sourceRef = descriptor.sourceUrl;

            if (typeof sourceRef !== "string" || !sourceRef.trim()) {
                throw new Error(
                    `PointCloudAdapter: Invalid source URL for layer "${layerId}": ${sourceRef}`,
                );
            }

            const loader = new CopcStreamingLoader(
                sourceRef,
                PointCloudAdapter.DEFAULT_STREAMING_OPTIONS,
            );

            const task = createCancellable();

            const state: PointCloudLayerState = {
                loader,
                viewportManager: null,
                initTask: task,
                config: pointCloudConfig,
                data: null,
                dataVersion: 0,
            };

            this._layers.set(layerId, state);

            this._initializeLayer(layerId, state, ctx);
        } catch (error) {
            const state = this._layers.get(layerId);
            state?.loader.destroy();
            this._layers.delete(layerId);
            logger.error(
                `PointCloudAdapter: Failed to add layer "${layerId}"`,
                error,
            );
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

            let firstRender = true;

            loader.setOnPointsLoaded((data: PointCloudData) => {
                if (firstRender) {
                    firstRender = false;
                    perfTracker.mark("first-points-rendered", {
                        pointCount: data.pointCount,
                    });
                }
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
                    loader
                        .selectNodesSSE(camera, viewportBounds)
                        .catch((err) => {
                            logger.error(
                                `PointCloudAdapter: Error selecting nodes for viewport on layer "${layerId}"`,
                                err,
                            );
                        });
                },
                {
                    debounceMs: 150,
                    getCameraPosition: () =>
                        ctx.overlayManager.getCameraPosition() ?? [0, 0, 0],
                    getFrustumPlanes: () =>
                        ctx.overlayManager.getFrustumPlanes(),
                    getActiveViewport: () =>
                        ctx.overlayManager.getActiveViewport(),
                    onImmediateChange: (_viewport, camera) => {
                        loader.setCameraSnapshot(camera);
                    },
                },
            );

            state.viewportManager = viewportManager;
            viewportManager.start();
        }).catch((error) => {
            logger.error(
                `PointCloudAdapter: Failed to initialize COPC loader for layer "${layerId}"`,
                error,
            );
            this._layers.delete(layerId);
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
        ctx.overlayManager.setLayerVisibility(layerId, visible);
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

    updateConfig(
        renderUnit: RenderUnit<typeof LayerRoles.POINT_CLOUD>,
        ctx: MapContext,
    ): void {
        const { id: layerId, descriptor } = renderUnit;
        const { config } = descriptor;

        if (!isPointCloudConfig(config)) {
            logger.warn(
                `PointCloudAdapter: Cannot update non-point-cloud config for layer "${layerId}"`,
            );
            return;
        }

        const state = this._layers.get(layerId);
        if (!state) {
            logger.warn(
                `PointCloudAdapter: No state found for layer "${layerId}"`,
            );
            return;
        }

        const prevConfig = state.config;
        state.config = config;

        if (this._canUpdateInPlace(prevConfig, config)) {
            if (prevConfig.colorScheme !== config.colorScheme) {
                state.loader.switchScheme(
                    config.colorScheme ?? ColorScheme.RGB,
                );
            }
            // Visual-only update: update layer props in place, no destroy+create.
            // Keeps in-flight loads alive and avoids abort cascade.
            try {
                const data = state.loader.getLoadedPointCloudData();
                const layer = PointCloudLayerFactory.createLayer(
                    layerId,
                    data,
                    config,
                    state.dataVersion,
                );
                ctx.overlayManager.updateLayer(
                    layerId,
                    layer.props as Partial<Layer>,
                );
            } catch {
                void 0;
            }
        } else {
            this.removeFromMap(layerId, ctx);
            this.addToMap(layerId, descriptor, ctx);
        }
    }

    private _canUpdateInPlace(
        prevConfig: PointCloudLayerConfig,
        nextConfig: PointCloudLayerConfig,
    ): boolean {
        const allKeys = new Set([
            ...Object.keys(prevConfig),
            ...Object.keys(nextConfig),
        ]) as Set<keyof PointCloudLayerConfig>;

        for (const key of allKeys) {
            if (key === "role") continue;
            if (PointCloudAdapter.VISUAL_FIELDS.has(key as string)) continue;
            if (!comparer.structural(prevConfig[key], nextConfig[key])) {
                return false;
            }
        }

        return true;
    }

    private _updateDeckLayer(
        layerId: string,
        overlayManager: DeckOverlayManager,
    ): void {
        const state = this._layers.get(layerId);
        if (!state) return;

        const { config, data, dataVersion } = state;

        if (!data) {
            logger.warn(
                `PointCloudAdapter: No data available for layer "${layerId}"`,
            );
            return;
        }

        try {
            state.dataVersion = dataVersion + 1;

            const layer = PointCloudLayerFactory.createLayer(
                layerId,
                data,
                config,
                state.dataVersion,
            );

            overlayManager.addLayer(layerId, layer);
        } catch (error) {
            logger.error(
                `PointCloudAdapter: Failed to update deck.gl layer for "${layerId}"`,
                error,
            );
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
                logger.error(
                    `PointCloudAdapter: Error disposing layer "${layerId}"`,
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
