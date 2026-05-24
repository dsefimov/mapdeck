import type maplibregl from "maplibre-gl";
import type {
    LayerAdapter,
    LayerConfig,
    RenderUnit,
} from "@core/framework/types";
import { LayerRoles } from "@core/framework/types";
import { isRasterConfig } from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";

/**
 * Adapter for raster tile layers.
 * Implements LayerAdapter interface for LayerRoles.RASTER.
 */
export class RasterAdapter implements LayerAdapter {
    readonly supportedRole = LayerRoles.RASTER;

    /**
     * Add a raster layer to the map.
     * @param layerId - Unique identifier for the layer
     * @param config - Raster layer configuration
     * @param sourceRef - Tile URL template (e.g., "https://.../{z}/{x}/{y}.png")
     * @param map - Map instance to add the layer to
     */
    addToMap(
        layerId: string,
        config: LayerConfig,
        sourceRef: string,
        map: maplibregl.Map,
    ): void {
        try {
            if (!isRasterConfig(config)) {
                throw new Error(
                    `Config is not for raster role: ${config.role}`,
                );
            }

            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
            if (map.getSource(layerId)) {
                map.removeSource(layerId);
            }

            // Assume sourceRef is an XYZ tile URL template
            map.addSource(layerId, {
                type: "raster",
                tiles: [sourceRef],
                tileSize: 256,
            });

            map.addLayer({
                id: layerId,
                type: "raster",
                source: layerId,
                paint: {
                    "raster-opacity": config.opacity ?? 1.0,
                },
            });

            const visible = config.visible ?? true;
            if (!visible) {
                this.updateVisibility(layerId, false, map);
            }
        } catch (error) {
            logger.error(
                `RasterAdapter: Failed to add layer "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    /**
     * Remove a raster layer from the map.
     * @param layerId - Unique identifier for the layer
     * @param map - Map instance to remove the layer from
     */
    removeFromMap(layerId: string, map: maplibregl.Map): void {
        try {
            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
            if (map.getSource(layerId)) {
                map.removeSource(layerId);
            }
        } catch (error) {
            logger.error(
                `RasterAdapter: Failed to remove layer "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    /**
     * Update raster layer visibility.
     * @param layerId - Unique identifier for the layer
     * @param visible - Whether the layer should be visible
     * @param map - Map instance containing the layer
     */
    updateVisibility(
        layerId: string,
        visible: boolean,
        map: maplibregl.Map,
    ): void {
        try {
            if (map.getLayer(layerId)) {
                map.setLayoutProperty(
                    layerId,
                    "visibility",
                    visible ? "visible" : "none",
                );
            }
        } catch (error) {
            logger.error(
                `RasterAdapter: Failed to update visibility for "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    updateConfig(renderUnit: RenderUnit, map: maplibregl.Map): void {
        this.removeFromMap(renderUnit.id, map);
        this.addToMap(
            renderUnit.id,
            renderUnit.descriptor.config,
            renderUnit.descriptor.sourceUrl,
            map,
        );
    }
}
