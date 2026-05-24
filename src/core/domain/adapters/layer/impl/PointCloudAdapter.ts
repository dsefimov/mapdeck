import type maplibregl from "maplibre-gl";
import type {
    LayerAdapter,
    PointCloudLayerConfig,
    RenderUnit,
} from "@core/framework/types";
import { LayerRoles } from "@core/framework/types";
import { isPointCloudConfig, ColorScheme } from "@core/framework/types";
import { overlayManager } from "@core/domain/overlay";
import type { Layer } from "@deck.gl/core";
import {
    type PointCloudData,
    type StreamingLoaderOptions,
    type ViewportInfo,
} from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";
import { createCancellable } from "@core/shared/async";
import { CopcStreamingLoader } from "@core/domain/overlay/loaders/CopcStreamingLoader";
import { ViewportManager } from "@core/domain/overlay/ViewportManager";
import { PointCloudLayerFactory } from "@core/domain/overlay/layers/PointCloudLayerFactory";
import { perfTracker } from "@core/shared/diagnostics/PerfTracker";

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
            pointBudget: 10_000_000,
            maxConcurrentRequests: 4,
            viewportDebounceMs: 150,
            maxOctreeDepth: 20,
            maxSubtreesPerViewport: 60,
        };

    private loaders = new Map<string, CopcStreamingLoader>();
    private viewportManagers = new Map<string, ViewportManager>();
    private currentData = new Map<string, PointCloudData>();
    private initTasks = new Map<string, ReturnType<typeof createCancellable>>();
    private _layerConfigs = new Map<string, PointCloudLayerConfig>();
    private _dataVersions = new Map<string, number>();

    addToMap(
        layerId: string,
        descriptor: import("@core/framework/types").RenderDescriptor<
            typeof LayerRoles.POINT_CLOUD
        >,
        map: maplibregl.Map,
    ): void {
        try {
            if (!isPointCloudConfig(descriptor.config)) {
                throw new Error(
                    `Config is not for point cloud role: ${descriptor.config.role}`,
                );
            }

            this.removeFromMap(layerId, map);

            if (!overlayManager.isAttached()) {
                overlayManager.attachToMap(map);
            }

            const pointCloudConfig = descriptor.config as PointCloudLayerConfig;
            this._layerConfigs.set(layerId, pointCloudConfig);

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
            this.loaders.set(layerId, loader);

            const task = createCancellable();
            this.initTasks.set(layerId, task);

            this._initializeLayer({
                task,
                layerId,
                config: pointCloudConfig,
                loader,
                map,
            });
        } catch (error) {
            logger.error(
                `PointCloudAdapter: Failed to add layer "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    private _initializeLayer(ctx: {
        task: ReturnType<typeof createCancellable>;
        layerId: string;
        config: PointCloudLayerConfig;
        loader: CopcStreamingLoader;
        map: maplibregl.Map;
    }): void {
        const { task, layerId, loader, map } = ctx;
        const opts = PointCloudAdapter.DEFAULT_STREAMING_OPTIONS;

        task.run(async (signal) => {
            const initResult = await loader.initialize();
            if (signal.aborted) return;

            const bounds = initResult.bounds;
            const spacingMeters =
                initResult.spacingMeters ?? initResult.spacing;

            let firstRender = true;

            loader.setOnPointsLoaded((data: PointCloudData) => {
                if (firstRender) {
                    firstRender = false;
                    perfTracker.mark("first-points-rendered", {
                        pointCount: data.pointCount,
                    });
                }
                this.currentData.set(layerId, data);
                const currentConfig = this._layerConfigs.get(layerId);
                if (currentConfig) {
                    this._updateDeckLayer(layerId, currentConfig);
                }
            });

            const viewportManager = new ViewportManager(
                map,
                (viewport: ViewportInfo) => {
                    loader.selectNodesForViewport(viewport).catch((err) => {
                        logger.error(
                            `PointCloudAdapter: Error selecting nodes for viewport on layer "${layerId}"`,
                            err,
                        );
                    });
                },
                {
                    debounceMs: opts.viewportDebounceMs,
                    maxOctreeDepth: opts.maxOctreeDepth,
                    spacing: spacingMeters,
                    cloudBounds: bounds,
                },
            );

            this.viewportManagers.set(layerId, viewportManager);
            viewportManager.start();

            const initialViewport = viewportManager.getCurrentViewport();
            await loader.selectNodesForViewport(initialViewport);
        }).catch((error) => {
            logger.error(
                `PointCloudAdapter: Failed to initialize COPC loader for layer "${layerId}"`,
                error,
            );
            this.loaders.delete(layerId);
            this.initTasks.delete(layerId);
        });
    }

    removeFromMap(layerId: string, _map: maplibregl.Map): void {
        try {
            const initTask = this.initTasks.get(layerId);
            if (initTask) {
                initTask.cancel();
                this.initTasks.delete(layerId);
            }

            const viewportManager = this.viewportManagers.get(layerId);
            if (viewportManager) {
                viewportManager.stop();
                viewportManager.destroy();
                this.viewportManagers.delete(layerId);
            }

            const loader = this.loaders.get(layerId);
            if (loader) {
                loader.destroy();
                this.loaders.delete(layerId);
            }

            overlayManager.removeLayer(layerId);
            this.currentData.delete(layerId);
            this._layerConfigs.delete(layerId);
        } catch (error) {
            logger.error(
                `PointCloudAdapter: Failed to remove layer "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    updateVisibility(
        layerId: string,
        visible: boolean,
        _map: maplibregl.Map,
    ): void {
        overlayManager.setLayerVisibility(layerId, visible);
    }

    /**
     * Visual-only fields that can be updated without reloading point data.
     */
    private static readonly VISUAL_FIELDS = new Set([
        "pointSize",
        "colorScheme",
        "opacity",
        "intensityMin",
        "intensityMax",
        "classificationFilter",
        "filterByClassification",
    ]);

    /**
     * Update layer configuration.
     *
     * If only visual properties changed (color scheme, point size, etc.),
     * updates the deck.gl layer in-place without reloading point data.
     * Otherwise falls back to full recreate.
     */
    updateConfig(
        renderUnit: RenderUnit<typeof LayerRoles.POINT_CLOUD>,
        map: maplibregl.Map,
    ): void {
        const { id: layerId, descriptor } = renderUnit;
        const { config } = descriptor;

        if (!isPointCloudConfig(config)) {
            logger.warn(
                `PointCloudAdapter: Cannot update non-point-cloud config for layer "${layerId}"`,
            );
            return;
        }

        const prevConfig = this._layerConfigs.get(layerId);
        this._layerConfigs.set(layerId, config);

        if (prevConfig && this._canUpdateInPlace(prevConfig, config)) {
            const loader = this.loaders.get(layerId);
            if (loader && prevConfig.colorScheme !== config.colorScheme) {
                loader
                    .recomputeColors(config.colorScheme ?? ColorScheme.RGB)
                    .catch((err) => {
                        logger.error(
                            `PointCloudAdapter: Failed to recompute colors for layer "${layerId}"`,
                            err,
                        );
                    });
            } else {
                this._updateDeckLayer(layerId, config);
            }
        } else {
            this.removeFromMap(layerId, map);
            this.addToMap(layerId, descriptor, map);
        }
    }

    /**
     * Check whether a config change affects only visual properties
     * and can be applied without reloading point data.
     */
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
            if (
                JSON.stringify(prevConfig[key]) !==
                JSON.stringify(nextConfig[key])
            ) {
                return false;
            }
        }

        return true;
    }

    private _updateDeckLayer(
        layerId: string,
        config: PointCloudLayerConfig,
    ): void {
        const data = this.currentData.get(layerId);

        if (!data) {
            logger.warn(
                `PointCloudAdapter: No data available for layer "${layerId}"`,
            );
            return;
        }

        try {
            // Bump version to signal data change to deck.gl
            const version = (this._dataVersions.get(layerId) ?? 0) + 1;
            this._dataVersions.set(layerId, version);

            const layer = PointCloudLayerFactory.createLayer(
                layerId,
                data,
                config,
                version,
            );

            // Use updateLayer if already exists (avoids full GPU re-upload),
            // fall back to addLayer for first render
            if (
                !overlayManager.updateLayer(
                    layerId,
                    layer.props as Partial<Layer>,
                )
            ) {
                overlayManager.addLayer(layerId, layer);
            }
        } catch (error) {
            logger.error(
                `PointCloudAdapter: Failed to update deck.gl layer for "${layerId}"`,
                error,
            );
        }
    }

    dispose(): void {
        this._safeDispose(
            this.initTasks,
            (task) => task.cancel(),
            "cancelling init task",
        );
        this._safeDispose(
            this.loaders,
            (loader) => loader.destroy(),
            "destroying loader",
        );
        this._safeDispose(
            this.viewportManagers,
            (vm) => vm.destroy(),
            "destroying viewport manager",
        );
        this.currentData.clear();
    }

    /**
     * Get loaded point cloud data for a layer.
     */
    getLoadedData(layerId: string): PointCloudData | undefined {
        return this.currentData.get(layerId);
    }

    private _safeDispose<K, V>(
        map: Map<K, V>,
        dispose: (value: V) => void,
        action: string,
    ): void {
        for (const [key, value] of map) {
            try {
                dispose(value);
            } catch (error) {
                logger.error(
                    `PointCloudAdapter: Error ${action} for "${String(key)}"`,
                    error,
                );
            }
        }
        map.clear();
    }
}
