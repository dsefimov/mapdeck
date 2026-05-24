import type maplibregl from "maplibre-gl";
import type {
    LayerAdapter,
    RenderUnit,
    RenderDescriptor,
} from "@core/framework/types";
import { LayerRoles } from "@core/framework/types";
import { isRasterConfig } from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";

/**
 * Adapter for raster tile layers.
 * Implements LayerAdapter interface for LayerRoles.RASTER.
 */
export class RasterAdapter implements LayerAdapter<typeof LayerRoles.RASTER> {
    readonly role = LayerRoles.RASTER;

    /**
     * Add a raster layer to the map.
     * @param layerId - Unique identifier for the layer
     * @param descriptor - Render descriptor with config and source URL
     * @param map - Map instance to add the layer to
     */
    addToMap(
        layerId: string,
        descriptor: RenderDescriptor<typeof LayerRoles.RASTER>,
        map: maplibregl.Map,
    ): void {
        try {
            if (!isRasterConfig(descriptor.config)) {
                throw new Error(
                    `Config is not for raster role: ${descriptor.config.role}`,
                );
            }

            const { config, sourceUrl } = descriptor;

            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
            if (map.getSource(layerId)) {
                map.removeSource(layerId);
            }

            // sourceUrl is an XYZ tile URL template
            map.addSource(layerId, {
                type: "raster",
                tiles: [sourceUrl],
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

    updateConfig(
        renderUnit: RenderUnit<typeof LayerRoles.RASTER>,
        map: maplibregl.Map,
    ): void {
        this.removeFromMap(renderUnit.id, map);
        this.addToMap(renderUnit.id, renderUnit.descriptor, map);
    }
}
