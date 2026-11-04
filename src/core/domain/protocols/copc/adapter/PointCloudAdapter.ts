import type {
    LayerAdapter,
    MapContext,
    PointCloudDataAdapter,
    RenderDescriptor,
    RenderUnit,
} from "@core/contracts";
import { logger } from "@core/lib/logger";
import {
    ColorScheme,
    POINT_CLOUD_INCOMING_SUFFIX,
    stripPointCloudLayerSuffix,
    type PointCloudData,
    type PointCloudFrame,
} from "@core/contracts";
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
import { styleNumber } from "../../logic/styleValues";
import { resolveHiddenClassifications } from "../logic/classificationFilter";

/** Deck layer type through the port — the protocol names no deck import. */
type DeckLayer = Parameters<MapContext["overlayManager"]["addLayer"]>[1];

/** Viewport changes settle this long before a fetch cycle starts. */
const VIEWPORT_DEBOUNCE_MS = 150;

interface PointCloudLayerState {
    loader: CopcStreamingLoader;
    viewportManager: ViewportManager | null;
    initTask: ReturnType<typeof createCancellable>;
    config: Record<string, unknown>;
    /** Latest frame from the loader. */
    frame: PointCloudFrame | null;
    /** Base envelopes already handed to deck — a same reference means deck can skip the upload. */
    pushedBase: PointCloudData | null;
    pushedIncoming: PointCloudData | null;
    /** Monotonic base version for updateTriggers. */
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
     *   the deployment's runtime config. The value is absolutized against
     *   the page before use: the decoder runs in inline-blob workers, and
     *   a relative URL cannot resolve from a blob: base.
     */
    constructor(lazPerfWasmUrl = "laz-perf.wasm") {
        this._lazPerfWasmUrl = absolutizeWasmUrl(lazPerfWasmUrl);
    }

    private readonly _lazPerfWasmUrl: string;

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

            // Decode runs in the worker pool — the main thread only hands
            // the wasm URL over; each worker instantiates its own laz-perf.
            const loader = new CopcStreamingLoader(
                sourceRef,
                PointCloudAdapter.DEFAULT_STREAMING_OPTIONS,
                this._lazPerfWasmUrl,
            );

            const task = createCancellable();

            const state: PointCloudLayerState = {
                loader,
                viewportManager: null,
                initTask: task,
                config: pointCloudConfig,
                frame: null,
                pushedBase: null,
                pushedIncoming: null,
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

            // The loader boots in RGB; a layer configured with another
            // scheme must converge to it before the first nodes load, or
            // it renders (and caches) RGB colors until a manual switch.
            const initialScheme =
                (state.config.colorScheme as ColorScheme | undefined) ??
                ColorScheme.RGB;
            if (initialScheme !== ColorScheme.RGB) {
                loader.switchScheme(initialScheme);
            }

            // Same convergence for a pre-hidden class set: it must be in
            // place before the first frame, not only after a config change.
            const initialHidden = toHiddenSet(
                state.config.hiddenClassifications,
            );
            if (initialHidden.size > 0) {
                loader.setHiddenClassifications(initialHidden);
            }

            loader.setOnPointsLoaded((frame: PointCloudFrame) => {
                state.frame = frame;
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
        ctx.overlayManager.removeLayer(this._incomingLayerId(layerId));
        ctx.overlayManager.removeLayer(layerId);

        this._layers.delete(layerId);
    }

    updateVisibility(layerId: string, visible: boolean, ctx: MapContext): void {
        const state = this._layers.get(layerId);
        if (state) state.visible = visible;

        if (visible && state?.frame) {
            // Re-create the deck layers from retained frames so the re-shown
            // layers actually render without waiting for a viewport change
            // (re-adding the same layer instance via setProps does not
            // reliably re-render in the interleaved overlay).
            state.pushedBase = null;
            state.pushedIncoming = null;
            this._updateDeckLayer(layerId, ctx.overlayManager);
        } else {
            ctx.overlayManager.setLayerVisibility(
                this._incomingLayerId(layerId),
                visible,
            );
            ctx.overlayManager.setLayerVisibility(layerId, visible);
        }
    }

    private static readonly VISUAL_FIELDS = new Set([
        "pointSize",
        "colorScheme",
        "opacity",
        "intensityMin",
        "intensityMax",
        "hiddenClassifications",
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
            this._updateInPlace(renderUnit, state, prevConfig, ctx);
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

    /**
     * In-place update instead of destroy+create: keeps in-flight loads
     * alive and avoids the abort cascade. Before the first points arrive
     * there is no deck layer to update — state.config is already stored,
     * so the next data push builds with it.
     */
    private _updateInPlace(
        renderUnit: RenderUnit,
        state: PointCloudLayerState,
        prevConfig: Record<string, unknown>,
        ctx: MapContext,
    ): void {
        const { id: layerId } = renderUnit;
        const { config } = renderUnit.descriptor;

        if (prevConfig.colorScheme !== config.colorScheme) {
            state.loader.switchScheme(
                (config.colorScheme as ColorScheme) ?? ColorScheme.RGB,
            );
        }
        if (
            !comparer.structural(
                prevConfig.hiddenClassifications,
                config.hiddenClassifications,
            )
        ) {
            state.loader.setHiddenClassifications(
                toHiddenSet(config.hiddenClassifications),
            );
        }

        // Before the first points arrive there is no deck layer to patch.
        if (!state.pushedBase && !state.pushedIncoming) return;

        // Visual-only props: patch the layers in place — the data
        // objects stay untouched, so deck keeps its GPU buffers.
        try {
            this._applyVisualProps(layerId, config, ctx);
        } catch (error) {
            logger.error(
                `PointCloudAdapter: failed to apply visual update for layer "${layerId}":`,
                error,
            );
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

    /**
     * Patch visual props (point size, opacity) onto the deck layers
     * without replacing their data objects — deck.gl keeps its uploaded
     * GPU buffers when the external buffer references are unchanged.
     */
    private _applyVisualProps(
        layerId: string,
        config: Record<string, unknown>,
        ctx: MapContext,
    ): void {
        const state = this._layers.get(layerId);
        const pointSize = styleNumber(config.pointSize, 2);
        const opacity = styleNumber(config.opacity, 1.0);
        const props = { pointSize, opacity } as Partial<DeckLayer>;
        ctx.overlayManager.updateLayer(layerId, props);
        if (state?.pushedIncoming) {
            ctx.overlayManager.updateLayer(
                this._incomingLayerId(layerId),
                props,
            );
        }
    }

    private _incomingLayerId(layerId: string): string {
        return layerId + POINT_CLOUD_INCOMING_SUFFIX;
    }

    private _updateDeckLayer(
        layerId: string,
        overlayManager: OverlayManager<DeckLayer>,
    ): void {
        const state = this._layers.get(layerId);
        if (!state) return;

        try {
            this._pushBaseLayer(layerId, state, overlayManager);
            this._pushIncomingLayer(layerId, state, overlayManager);
        } catch (error) {
            logger.error(
                `PointCloudAdapter: failed to add deck layer "${layerId}":`,
                error,
            );
        }
    }

    /**
     * The base is pushed only when its envelope object changes — between
     * commits the same reference means deck skips the upload entirely.
     */
    private _pushBaseLayer(
        layerId: string,
        state: PointCloudLayerState,
        overlayManager: OverlayManager<DeckLayer>,
    ): void {
        const base = state.frame?.base ?? null;
        if (!base || base === state.pushedBase) return;

        state.dataVersion += 1;
        overlayManager.addLayer(
            layerId,
            createPointCloudLayer(layerId, base, state.config, state.dataVersion),
        );
        state.pushedBase = base;
        this._applyRetainedVisibility(
            layerId,
            state.visible,
            overlayManager,
        );
    }

    /**
     * The incoming part is small and hot — every push swaps its layer. A
     * commit folds it into the base and takes its layer down.
     */
    private _pushIncomingLayer(
        layerId: string,
        state: PointCloudLayerState,
        overlayManager: OverlayManager<DeckLayer>,
    ): void {
        const incoming = state.frame?.incoming ?? null;
        const incomingId = this._incomingLayerId(layerId);

        if (incoming && incoming !== state.pushedIncoming) {
            overlayManager.addLayer(
                incomingId,
                createPointCloudLayer(
                    incomingId,
                    incoming,
                    state.config,
                    state.dataVersion,
                ),
            );
            state.pushedIncoming = incoming;
            this._applyRetainedVisibility(
                incomingId,
                state.visible,
                overlayManager,
            );
        } else if (!incoming && state.pushedIncoming) {
            overlayManager.removeLayer(incomingId);
            state.pushedIncoming = null;
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

    /** Serves both deck layer ids — the bare id and the incoming part's. */
    getLoadedData(layerId: string): PointCloudData | undefined {
        const incoming = layerId.endsWith(POINT_CLOUD_INCOMING_SUFFIX);
        const state = this._layers.get(
            stripPointCloudLayerSuffix(layerId),
        );
        if (!state?.frame) return undefined;
        return (incoming ? state.frame.incoming : state.frame.base) ?? undefined;
    }

    /**
     * Get all loaded point cloud data across all layers managed by this adapter.
     */
    getAllLoadedData(): PointCloudData[] {
        const result: PointCloudData[] = [];
        for (const state of this._layers.values()) {
            if (state.frame?.base) {
                result.push(state.frame.base);
            }
            if (state.frame?.incoming) {
                result.push(state.frame.incoming);
            }
        }
        return result;
    }
}

/**
 * Resolve the wasm location against the page: the decoder instantiates in
 * inline-blob workers, where a relative URL fails to parse ("blob:" has no
 * usable base for it). Outside a document (tests, SSR) the value passes
 * through untouched.
 */
export function absolutizeWasmUrl(url: string, base?: string): string {
    const documentBase =
        base ?? (typeof document === "undefined" ? undefined : document.baseURI);
    if (!documentBase) return url;
    try {
        return new URL(url, documentBase).href;
    } catch {
        return url;
    }
}

/**
 * Config value → hidden-code set for the loader. Validation runs again at
 * this crossing: the config object arrives as an untyped record.
 */
function toHiddenSet(value: unknown): ReadonlySet<number> {
    return new Set(resolveHiddenClassifications(value));
}
