import { GeoJsonLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type {
    LayerAdapter,
    RenderUnit,
    RenderDescriptor,
    MapContext,
} from "@core/contracts";
import { logger } from "@core/lib/logger";
import { boundedFetch } from "@core/lib/async";
import {
    getTilesForBounds,
    tileToQuadkey,
    tileToBBOX,
} from "@core/lib/geo/tile";
import { hexToRgba } from "@core/lib/color";
import { DEFAULT_ACCENT_CSS } from "@core/ui/theme";
import { appendUrlParams } from "../logic/appendUrlParams";
import type { GeoJsonAdapterConfig } from "../logic/adapterConfig";
import { parseGeoJsonAdapterConfig } from "../logic/adapterConfig";
import {
    DEFAULT_LINE_WIDTH_PX,
    DEFAULT_POINT_RADIUS_PX,
} from "./paintDefaults";
import type { FeatureCollection } from "geojson";

interface GeoJsonLayerState {
    map: MapContext["map"];
    overlayManager: MapContext["overlayManager"];
    sourceUrl: string;
    tiles: Map<string, FeatureCollection>;
    featureIds: Set<string | number | null | undefined>;
    mergedFc: FeatureCollection;
    lastZoom: number;
    isDisposed: boolean;
    /** Aborts the in-flight tile batch when superseded or removed. */
    loadAbort: AbortController | null;
}

/** Features requested per tile — one server page. */
const TILE_LIMIT = 5000;

/**
 * Merged FeatureCollection ceiling per layer. Panning within one zoom
 * quantum otherwise accumulates every visited tile forever; the oldest
 * cached tile is dropped first and refetched when the map returns to it.
 */
const MERGED_FC_LIMIT = 50_000;

/** A hung tile server must not pin a layer's resources forever. */
const TILE_FETCH_TIMEOUT_MS = 15_000;

/** Below this zoom the source is not fetched at all. */
const MIN_ZOOM = 2;

/**
 * Fetches happen at even zoom levels only: rounding down to a quantum of 2
 * halves the distinct request sets, so tiles fetched at one level are reused
 * when the map crosses a single level while panning.
 */
const ZOOM_STEP = 2;

export class GeoJsonAdapter implements LayerAdapter {
    readonly nativeLayerOrdering = false;

    constructor(private readonly maxMergedFeatures = MERGED_FC_LIMIT) {}

    private _layers = new Map<string, GeoJsonLayerState>();

    addToMap(
        layerId: string,
        descriptor: RenderDescriptor,
        ctx: MapContext,
    ): void {
        try {
            if (this._layers.has(layerId)) {
                this.removeFromMap(layerId, ctx);
            }

            const { sourceUrl } = descriptor;
            const state = createGeoJsonState(sourceUrl, ctx);
            const deckLayer = buildGeoJsonLayer(
                layerId,
                parseGeoJsonAdapterConfig(descriptor.config),
            );

            ctx.overlayManager.addLayer(layerId, deckLayer);
            // One moveend registration serves every layer of this adapter.
            if (this._layers.size === 0) {
                ctx.map.on("moveend", this._onMapMove);
            }
            this._layers.set(layerId, state);

            this._findAndLoadTiles(layerId);
        } catch (error) {
            logger.error(
                `GeoJsonAdapter: Failed to add layer "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    removeFromMap(layerId: string, ctx: MapContext): void {
        const state = this._layers.get(layerId);
        if (state) {
            state.isDisposed = true;
            state.loadAbort?.abort();
        }
        const removed = this._layers.delete(layerId);
        // One moveend registration serves every layer of this adapter.
        if (removed && this._layers.size === 0) {
            ctx.map.off("moveend", this._onMapMove);
        }
        ctx.overlayManager.removeLayer(layerId);
    }

    updateVisibility(layerId: string, visible: boolean, ctx: MapContext): void {
        try {
            ctx.overlayManager.setLayerVisibility(layerId, visible);
        } catch (error) {
            logger.error(
                `GeoJsonAdapter: Failed to update visibility for "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    updateConfig(renderUnit: RenderUnit, ctx: MapContext): void {
        const layerId = renderUnit.id;
        const state = this._layers.get(layerId);
        if (!state || state.isDisposed) {
            this.addToMap(layerId, renderUnit.descriptor, ctx);
            return;
        }

        const updates = buildGeoJsonLayerProps(
            parseGeoJsonAdapterConfig(renderUnit.descriptor.config),
        );
        ctx.overlayManager.updateLayer(layerId, updates as Partial<Layer>);
    }

    private _onMapMove = (): void => {
        const ids = Array.from(this._layers.keys());
        for (const layerId of ids) {
            this._findAndLoadTiles(layerId);
        }
    };

    private async _findAndLoadTiles(layerId: string): Promise<void> {
        const state = this._layers.get(layerId);
        if (!state || state.isDisposed) return;

        const zoom = this._resolveZoom(state);
        if (zoom < 0) return;

        const tiles = getTilesForBounds(this._mapBbox(state), zoom);

        this._resetOnZoomChange(state, zoom);
        state.lastZoom = zoom;

        const newTiles = this._uncachedTiles(state, tiles);
        if (newTiles.length === 0) return;

        logger.debug(
            `GeoJsonAdapter: loading ${newTiles.length} tile(s) at zoom ${zoom} for "${layerId}"`,
        );

        // A newer view of the map supersedes the in-flight batch.
        state.loadAbort?.abort();
        const abort = new AbortController();
        state.loadAbort = abort;

        const settled = await Promise.allSettled(
            newTiles.map((tile) =>
                this._fetchTile(state.sourceUrl, tile, abort.signal),
            ),
        );
        // A superseded batch discards its results wholesale — the newer
        // batch refetches and merges once; without this check a tile that
        // completed before the abort merges twice and duplicates features
        // that carry no id (dedup is id-only).
        if (state.isDisposed || state.loadAbort !== abort) return;

        settled.forEach((result, i) => {
            if (result.status !== "fulfilled") return;
            const fc = result.value;
            if (!fc) return;
            const tile = newTiles[i];
            if (!tile) return;
            state.tiles.set(tileToQuadkey(tile), fc);
            this._mergeTile(fc, state);
        });

        this._evictOverflow(state);
        this._updateLayer(layerId, state);
    }

    private _resolveZoom(state: GeoJsonLayerState): number {
        const rawZoom = state.map.getZoom();
        if (rawZoom < MIN_ZOOM) return -1;
        return ZOOM_STEP * Math.floor(rawZoom / ZOOM_STEP);
    }

    private _mapBbox(
        state: GeoJsonLayerState,
    ): [number, number, number, number] {
        const b = state.map.getBounds();
        return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    }

    private _resetOnZoomChange(state: GeoJsonLayerState, zoom: number): void {
        if (state.lastZoom === -1 || state.lastZoom === zoom) return;
        state.tiles.clear();
        state.featureIds.clear();
        state.mergedFc.features = [];
    }

    private _uncachedTiles(
        state: GeoJsonLayerState,
        tiles: Array<[number, number, number]>,
    ): Array<[number, number, number]> {
        return tiles.filter((tile) => !state.tiles.has(tileToQuadkey(tile)));
    }

    private async _fetchTile(
        baseUrl: string,
        tile: [number, number, number],
        batchSignal: AbortSignal,
    ): Promise<FeatureCollection | null> {
        try {
            const url = buildTileUrl(baseUrl, tile);
            const response = await boundedFetch(url, {
                headers: { Accept: "application/geo+json" },
                timeoutMs: TILE_FETCH_TIMEOUT_MS,
                signal: batchSignal,
            });
            if (!response.ok) return null;
            const data: unknown = await response.json();
            if (isFeatureCollection(data)) {
                return data;
            }
            return null;
        } catch (error) {
            logger.warn(
                `GeoJsonAdapter: failed to fetch tile ${baseUrl}:`,
                error,
            );
            return null;
        }
    }

    /**
     * Drop the oldest cached tiles while the merged collection exceeds the
     * ceiling, then rebuild the merge from the surviving cache — the same
     * id-dedup invariant as incremental merging.
     */
    private _evictOverflow(state: GeoJsonLayerState): void {
        let overflow = state.mergedFc.features.length - this.maxMergedFeatures;
        if (overflow <= 0) return;

        for (const qk of state.tiles.keys()) {
            const fc = state.tiles.get(qk);
            if (!fc) continue;
            state.tiles.delete(qk);
            overflow -= (fc.features ?? []).length;
            if (overflow <= 0) break;
        }
        this._rebuildMerged(state);
    }

    private _rebuildMerged(state: GeoJsonLayerState): void {
        const features: FeatureCollection["features"] = [];
        const ids = new Set<string | number>();
        for (const fc of state.tiles.values()) {
            for (const feature of fc.features ?? []) {
                if (feature.id != null) {
                    if (ids.has(feature.id)) continue;
                    ids.add(feature.id);
                }
                features.push(feature);
            }
        }
        state.featureIds = ids as GeoJsonLayerState["featureIds"];
        state.mergedFc.features = features;
    }

    private _mergeTile(fc: FeatureCollection, state: GeoJsonLayerState): void {
        if (!fc.features) return;
        for (const feature of fc.features) {
            const id = feature.id;
            if (id != null && state.featureIds.has(id)) continue;
            if (id != null) state.featureIds.add(id);
            state.mergedFc.features.push(feature);
        }
    }

    private _updateLayer(layerId: string, state: GeoJsonLayerState): void {
        state.mergedFc = {
            type: "FeatureCollection",
            features: state.mergedFc.features,
        };
        state.overlayManager.updateLayer(layerId, {
            data: state.mergedFc,
        } as Partial<Layer>);
    }
}

function createGeoJsonState(
    sourceUrl: string,
    ctx: MapContext,
): GeoJsonLayerState {
    return {
        map: ctx.map,
        overlayManager: ctx.overlayManager,
        sourceUrl,
        tiles: new Map(),
        featureIds: new Set(),
        mergedFc: { type: "FeatureCollection", features: [] },
        lastZoom: -1,
        isDisposed: false,
        loadAbort: null,
    };
}

/** Tile request URL: bbox/limit as query params, preserving existing ones. */
function buildTileUrl(
    baseUrl: string,
    tile: [number, number, number],
): string {
    return appendUrlParams(baseUrl, {
        bbox: tileToBBOX(tile).join(","),
        limit: String(TILE_LIMIT),
    });
}

function buildGeoJsonLayerProps(
    config: GeoJsonAdapterConfig,
): Record<string, unknown> {
    const paint = config.paint;
    const opacity = config.opacity;

    return {
        getFillColor: hexToRgba(
            (paint["fill-color"] as string) ?? DEFAULT_ACCENT_CSS,
            ((paint["fill-opacity"] as number) ?? opacity) * 255,
        ),
        getLineColor: hexToRgba(
            (paint["line-color"] as string) ?? DEFAULT_ACCENT_CSS,
            ((paint["line-opacity"] as number) ?? opacity) * 255,
        ),
        getLineWidth: paint["line-width"] ?? DEFAULT_LINE_WIDTH_PX,
        getPointRadius: paint["circle-radius"] ?? DEFAULT_POINT_RADIUS_PX,
    };
}

function isFeatureCollection(value: unknown): value is FeatureCollection {
    return (
        value !== null &&
        typeof value === "object" &&
        "features" in value &&
        Array.isArray((value as Record<string, unknown>).features)
    );
}

function buildGeoJsonLayer(
    layerId: string,
    config: GeoJsonAdapterConfig,
): GeoJsonLayer {
    const props = buildGeoJsonLayerProps(config);
    return new GeoJsonLayer({
        id: layerId,
        data: { type: "FeatureCollection", features: [] },
        pickable: true,
        filled: true,
        stroked: true,
        pointRadiusUnits: "pixels",
        lineWidthUnits: "pixels",
        lineWidthScale: 1,
        ...props,
    });
}
