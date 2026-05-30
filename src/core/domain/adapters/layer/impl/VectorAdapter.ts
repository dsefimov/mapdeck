import type {
    LayerAdapter,
    VectorLayerConfig,
    RenderUnit,
    RenderDescriptor,
    MapContext,
} from "@core/framework/types";
import { LayerRoles } from "@core/framework/types";
import { isVectorConfig } from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";
import type { LayerSpecification } from "maplibre-gl";

/**
 * Adapter for vector tile layers.
 * Implements LayerAdapter interface for LayerRoles.VECTOR.
 */
export class VectorAdapter implements LayerAdapter<typeof LayerRoles.VECTOR> {
    readonly role = LayerRoles.VECTOR;

    addToMap(
        layerId: string,
        descriptor: RenderDescriptor<typeof LayerRoles.VECTOR>,
        ctx: MapContext,
    ): void {
        try {
            const { map } = ctx;

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
                this.updateVisibility(layerId, false, ctx);
            }
        } catch (error) {
            logger.error(
                `VectorAdapter: Failed to add layer "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    removeFromMap(layerId: string, ctx: MapContext): void {
        try {
            const map = ctx.map;

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

    updateVisibility(layerId: string, visible: boolean, ctx: MapContext): void {
        try {
            const map = ctx.map;

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
        ctx: MapContext,
    ): void {
        try {
            const { map } = ctx;
            const layerId = renderUnit.id;
            const config = renderUnit.descriptor.config as VectorLayerConfig;
            const paint = config.paint ?? {};

            if (!map.getLayer(layerId)) {
                this.addToMap(layerId, renderUnit.descriptor, ctx);
                return;
            }

            applyVectorPaint(map, layerId, config.layerType, paint);

            if (config.visible !== undefined) {
                map.setLayoutProperty(
                    layerId,
                    "visibility",
                    config.visible ? "visible" : "none",
                );
            }
        } catch (error) {
            logger.error(
                `VectorAdapter: Failed to update config for "${renderUnit.id}"`,
                error,
            );
            throw error;
        }
    }

    private _createLayerSpec(
        layerId: string,
        sourceId: string,
        layerType: "fill" | "line" | "circle" | "symbol",
        config: VectorLayerConfig,
    ): LayerSpecification {
        const paint = config.paint ?? {};
        const opacity = config.opacity ?? 1.0;

        switch (layerType) {
            case "fill":
                return createFillSpec(layerId, sourceId, paint, opacity);
            case "line":
                return createLineSpec(layerId, sourceId, paint, opacity);
            case "circle":
                return createCircleSpec(layerId, sourceId, paint, opacity);
            case "symbol":
                return createSymbolSpec(layerId, sourceId, paint, opacity);
        }
    }
}

function createFillSpec(
    layerId: string,
    sourceId: string,
    paint: NonNullable<VectorLayerConfig["paint"]>,
    opacity: number,
): LayerSpecification {
    return {
        id: layerId,
        type: "fill",
        source: sourceId,
        paint: {
            "fill-color": paint["fill-color"] ?? "#005a9b",
            "fill-opacity": paint["fill-opacity"] ?? opacity,
        },
    };
}

function createLineSpec(
    layerId: string,
    sourceId: string,
    paint: NonNullable<VectorLayerConfig["paint"]>,
    opacity: number,
): LayerSpecification {
    return {
        id: layerId,
        type: "line",
        source: sourceId,
        paint: {
            "line-color": paint["line-color"] ?? "#005a9b",
            "line-width": paint["line-width"] ?? 2,
            "line-opacity": paint["line-opacity"] ?? opacity,
        },
    };
}

function createCircleSpec(
    layerId: string,
    sourceId: string,
    paint: NonNullable<VectorLayerConfig["paint"]>,
    opacity: number,
): LayerSpecification {
    return {
        id: layerId,
        type: "circle",
        source: sourceId,
        paint: {
            "circle-color": paint["circle-color"] ?? "#005a9b",
            "circle-radius": paint["circle-radius"] ?? 5,
            "circle-opacity": paint["circle-opacity"] ?? opacity,
        },
    };
}

function createSymbolSpec(
    layerId: string,
    sourceId: string,
    paint: NonNullable<VectorLayerConfig["paint"]>,
    opacity: number,
): LayerSpecification {
    return {
        id: layerId,
        type: "symbol",
        source: sourceId,
        layout: {
            "text-field": ["get", "name"],
            "text-size": 12,
        },
        paint: {
            "text-color": paint["text-color"] ?? "#000000",
            "text-opacity": opacity,
        },
    };
}

function applyVectorPaint(
    map: import("maplibre-gl").Map,
    layerId: string,
    layerType: string,
    paint: Record<string, unknown>,
): void {
    const set = (prop: string, value: unknown): void => {
        if (value !== undefined) map.setPaintProperty(layerId, prop, value);
    };

    switch (layerType) {
        case "fill":
            set("fill-color", paint["fill-color"]);
            set("fill-opacity", paint["fill-opacity"]);
            break;
        case "line":
            set("line-color", paint["line-color"]);
            set("line-width", paint["line-width"]);
            set("line-opacity", paint["line-opacity"]);
            break;
        case "circle":
            set("circle-color", paint["circle-color"]);
            set("circle-radius", paint["circle-radius"]);
            set("circle-opacity", paint["circle-opacity"]);
            break;
    }
}
