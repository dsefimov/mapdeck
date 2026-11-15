import type {
    LayerAdapter,
    MapContext,
    RenderUnit,
    RenderDescriptor,
} from "@core/contracts";
import { logger } from "@core/lib/logger";
import { parseRasterAdapterConfig } from "../logic/adapterConfig";
import {
    removeNativeLayerSource,
    setNativeVisibility,
} from "./nativeMapOps";

/**
 * Pixel size of one raster tile. WMS GetMap requests WIDTH/HEIGHT of exactly
 * this size — a mismatch between the two breaks tile-grid alignment.
 */
export const RASTER_TILE_SIZE_PX = 256;

/**
 * Adapter for raster tile layers (WMS, XYZ, COG).
 */
export class RasterAdapter implements LayerAdapter {
    readonly nativeLayerOrdering = true;

    addToMap(
        layerId: string,
        descriptor: RenderDescriptor,
        ctx: MapContext,
    ): void {
        try {
            const { map } = ctx;
            const { sourceUrl } = descriptor;
            const cfg = parseRasterAdapterConfig(descriptor.config);

            removeNativeLayerSource(map, layerId);

            map.addSource(layerId, {
                type: "raster",
                tiles: [sourceUrl],
                tileSize: RASTER_TILE_SIZE_PX,
                ...(cfg.maxzoom !== undefined ? { maxzoom: cfg.maxzoom } : {}),
            });

            map.addLayer({
                id: layerId,
                type: "raster",
                source: layerId,
                paint: {
                    "raster-opacity": cfg.opacity,
                },
            });
        } catch (error) {
            logger.error(
                `RasterAdapter: Failed to add layer "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    removeFromMap(layerId: string, ctx: MapContext): void {
        try {
            removeNativeLayerSource(ctx.map, layerId);
        } catch (error) {
            logger.error(
                `RasterAdapter: Failed to remove layer "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    updateVisibility(layerId: string, visible: boolean, ctx: MapContext): void {
        try {
            setNativeVisibility(ctx.map, layerId, visible);
        } catch (error) {
            logger.error(
                `RasterAdapter: Failed to update visibility for "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    updateConfig(renderUnit: RenderUnit, ctx: MapContext): void {
        this.removeFromMap(renderUnit.id, ctx);
        this.addToMap(renderUnit.id, renderUnit.descriptor, ctx);
    }
}
