import { GeoJsonLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type {
    LayerAdapter,
    RenderUnit,
    RenderDescriptor,
    MapContext,
} from "@core/framework/types";
import {
    LayerRoles,
    isGeoJsonConfig,
    type GeoJsonLayerConfig,
} from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";
import {
    getTilesForBounds,
    tileToQuadkey,
    tileToBBOX,
} from "@core/shared/tile";
import { hexToRgba } from "@core/shared/ui/themeColors";
import type { FeatureCollection } from "geojson";

interface GeoJsonLayerState {
    map: MapContext["map"];
    overlayManager: MapContext["overlayManager"];
    sourceUrl: string;
    tileCache: Map<string, FeatureCollection>;
    featureIds: Set<string | number | null | undefined>;
    mergedFc: FeatureCollection;
    lastZoom: number;
    isDisposed: boolean;
}

const TILE_LIMIT = 5000;
const MIN_ZOOM = 2;

export class GeoJsonAdapter implements LayerAdapter<typeof LayerRoles.GEOJSON> {
    readonly role = LayerRoles.GEOJSON;

    private _layers = new Map<string, GeoJsonLayerState>();

    addToMap(
        layerId: string,
        descriptor: RenderDescriptor<typeof LayerRoles.GEOJSON>,
        ctx: MapContext,
    ): void {
        try {
            if (!isGeoJsonConfig(descriptor.config)) {
                throw new Error(
                    `Config is not for geojson role: ${descriptor.config.role}`,
                );
            }

            if (this._layers.has(layerId)) {
                this.removeFromMap(layerId, ctx);
            }

            const { config, sourceUrl } = descriptor;
            const state = createGeoJsonState(sourceUrl, ctx);
            const deckLayer = buildGeoJsonLayer(layerId, config);

            ctx.overlayManager.addLayer(layerId, deckLayer);
            this._layers.set(layerId, state);

            ctx.map.on("moveend", this._onMapMove);
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
            ctx.map.off("moveend", this._onMapMove);
        }
        this._layers.delete(layerId);
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

    updateConfig(
        renderUnit: RenderUnit<typeof LayerRoles.GEOJSON>,
        ctx: MapContext,
    ): void {
        const layerId = renderUnit.id;
        const state = this._layers.get(layerId);
        if (!state || state.isDisposed) {
            this.addToMap(layerId, renderUnit.descriptor, ctx);
            return;
        }

        const config = renderUnit.descriptor.config as GeoJsonLayerConfig;
        const updates = buildGeoJsonLayerProps(config);
        ctx.overlayManager.updateLayer(layerId, updates as Partial<Layer>);
    }

    // ---- internal ----

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

        const settled = await Promise.allSettled(
            newTiles.map((tile) => this._fetchTile(state.sourceUrl, tile)),
        );
        if (state.isDisposed) return;

        for (let i = 0; i < settled.length; i++) {
            const result = settled[i]!;
            if (result.status !== "fulfilled") continue;
            const fc = result.value;
            if (!fc) continue;
            const qk = tileToQuadkey(newTiles[i]!);
            state.tileCache.set(qk, fc);
            this._mergeTile(fc, state);
        }

        this._updateLayer(layerId, state);
    }

    private _resolveZoom(state: GeoJsonLayerState): number {
        const rawZoom = state.map.getZoom();
        if (rawZoom < MIN_ZOOM) return -1;
        return 2 * Math.floor(rawZoom / 2);
    }

    private _mapBbox(
        state: GeoJsonLayerState,
    ): [number, number, number, number] {
        const b = state.map.getBounds();
        return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    }

    private _resetOnZoomChange(state: GeoJsonLayerState, zoom: number): void {
        if (state.lastZoom === -1 || state.lastZoom === zoom) return;
        state.tileCache.clear();
        state.featureIds.clear();
        state.mergedFc.features = [];
    }

    private _uncachedTiles(
        state: GeoJsonLayerState,
        tiles: Array<[number, number, number]>,
    ): Array<[number, number, number]> {
        const result: Array<[number, number, number]> = [];
        for (const tile of tiles) {
            if (!state.tileCache.has(tileToQuadkey(tile))) {
                result.push(tile);
            }
        }
        return result;
    }

    private async _fetchTile(
        baseUrl: string,
        tile: [number, number, number],
    ): Promise<FeatureCollection | null> {
        const bbox = tileToBBOX(tile);
        const url = `${baseUrl}?bbox=${bbox.join(",")}&limit=${TILE_LIMIT}`;

        try {
            const response = await fetch(url, {
                headers: { Accept: "application/geo+json" },
            });
            if (!response.ok) return null;
            const data: unknown = await response.json();
            if (
                data &&
                typeof data === "object" &&
                "features" in data &&
                Array.isArray((data as Record<string, unknown>).features)
            ) {
                return data as FeatureCollection;
            }
            return null;
        } catch {
            return null;
        }
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
        tileCache: new Map(),
        featureIds: new Set(),
        mergedFc: { type: "FeatureCollection", features: [] },
        lastZoom: -1,
        isDisposed: false,
    };
}

function buildGeoJsonLayerProps(
    config: GeoJsonLayerConfig,
): Record<string, unknown> {
    const paint = config.paint ?? {};
    const opacity = config.opacity ?? 1.0;

    return {
        getFillColor: hexToRgba(
            paint["fill-color"] ?? "#005a9b",
            (paint["fill-opacity"] ?? opacity) * 255,
        ),
        getLineColor: hexToRgba(
            paint["line-color"] ?? "#005a9b",
            (paint["line-opacity"] ?? opacity) * 255,
        ),
        getLineWidth: paint["line-width"] ?? 2,
        getPointRadius: paint["circle-radius"] ?? 5,
        visible: config.visible ?? true,
    };
}

function buildGeoJsonLayer(
    layerId: string,
    config: GeoJsonLayerConfig,
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
