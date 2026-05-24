import type maplibregl from "maplibre-gl";
import type {
    LayerAdapter,
    VectorLayerConfig,
    RenderUnit,
    RenderDescriptor,
} from "@core/framework/types";
import { LayerRoles } from "@core/framework/types";
import { isVectorConfig } from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";

/**
 * Adapter for vector tile layers.
 * Implements LayerAdapter interface for LayerRoles.VECTOR.
 */
export class VectorAdapter implements LayerAdapter<typeof LayerRoles.VECTOR> {
    readonly role = LayerRoles.VECTOR;

    addToMap(
        layerId: string,
        descriptor: RenderDescriptor<typeof LayerRoles.VECTOR>,
        map: maplibregl.Map,
    ): void {
        try {
            if (!isVectorConfig(descriptor.config)) {
                throw new Error(
                    `Config is not for vector role: ${descriptor.config.role}`,
                );
            }

            const { config, sourceUrl } = descriptor;

            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
            if (map.getSource(layerId)) {
                map.removeSource(layerId);
            }

            map.addSource(layerId, {
                type: "vector",
                tiles: [sourceUrl],
            });

            const layerSpec = this._createLayerSpec(
                layerId,
                layerId,
                config.layerType,
                config,
            );

            map.addLayer(layerSpec);

            const visible = config.visible ?? true;
            if (!visible) {
                this.updateVisibility(layerId, false, map);
            }
        } catch (error) {
            logger.error(
                `VectorAdapter: Failed to add layer "${layerId}"`,
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
                `VectorAdapter: Failed to remove layer "${layerId}"`,
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
                `VectorAdapter: Failed to update visibility for "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    updateConfig(
        renderUnit: RenderUnit<typeof LayerRoles.VECTOR>,
        map: maplibregl.Map,
    ): void {
        this.removeFromMap(renderUnit.id, map);
        this.addToMap(renderUnit.id, renderUnit.descriptor, map);
    }

    private _createLayerSpec(
        layerId: string,
        sourceId: string,
        layerType: "fill" | "line" | "circle" | "symbol",
        config: VectorLayerConfig,
    ): maplibregl.LayerSpecification {
        const opacity = config.opacity ?? 1.0;

        switch (layerType) {
            case "fill":
                return {
                    id: layerId,
                    type: "fill",
                    source: sourceId,
                    "source-layer": "",
                    paint: {
                        "fill-color": "#3f51b5",
                        "fill-opacity": opacity,
                    },
                };
            case "line":
                return {
                    id: layerId,
                    type: "line",
                    source: sourceId,
                    "source-layer": "",
                    paint: {
                        "line-color": "#3f51b5",
                        "line-width": 2,
                        "line-opacity": opacity,
                    },
                };
            case "circle":
                return {
                    id: layerId,
                    type: "circle",
                    source: sourceId,
                    "source-layer": "",
                    paint: {
                        "circle-color": "#3f51b5",
                        "circle-radius": 5,
                        "circle-opacity": opacity,
                    },
                };
            case "symbol":
                return {
                    id: layerId,
                    type: "symbol",
                    source: sourceId,
                    "source-layer": "",
                    layout: {
                        "text-field": ["get", "name"],
                        "text-size": 12,
                    },
                    paint: {
                        "text-color": "#000000",
                        "text-opacity": opacity,
                    },
                };
        }
    }
}
