import type maplibregl from "maplibre-gl";
import { logger } from "@core/shared/diagnostics/logger";
import type { FeatureProvider, Feature, CollectParams } from "../types";
import {
    isVectorConfig,
    isRasterConfig,
    isVector3DConfig,
    type LayerNode,
} from "@core/framework/types";

/**
 * Feature provider for vector layers rendered natively by the base map.
 * Uses map.queryRenderedFeatures to query vector, vector3d, and non-WMS raster layers.
 */
export class VectorFeatureProvider implements FeatureProvider {
    async collect(params: CollectParams): Promise<Feature[]> {
        const { screenX, screenY, map, visibleLayers } = params;

        const nativeLayerIds = this.getNativeLayerIds(visibleLayers);
        if (nativeLayerIds.length === 0) {
            return [];
        }

        try {
            const features = map.queryRenderedFeatures([screenX, screenY], {
                layers: nativeLayerIds,
            });

            if (features.length === 0) {
                return [];
            }

            return this.buildFeatures(features, visibleLayers);
        } catch (error) {
            logger.error(
                "VectorFeatureProvider: queryRenderedFeatures failed",
                error,
            );
            return [];
        }
    }

    /**
     * Get native map layer IDs from visible nodes.
     */
    private getNativeLayerIds(visibleLayers: LayerNode[]): string[] {
        const ids: string[] = [];
        for (const node of visibleLayers) {
            const config = node.roles.display.render.config;

            if (
                isVectorConfig(config) ||
                isVector3DConfig(config) ||
                (isRasterConfig(config) && config.type !== "wms")
            ) {
                ids.push(node.id);
            }
        }
        return ids;
    }

    /**
     * Build Feature array from queryRenderedFeatures results.
     */
    private buildFeatures(
        features: maplibregl.MapGeoJSONFeature[],
        visibleLayers: LayerNode[],
    ): Feature[] {
        const featuresByLayer = new Map<
            string,
            { layerName: string; features: maplibregl.MapGeoJSONFeature[] }
        >();

        for (const feature of features) {
            const layerId = feature.layer.id;
            if (!featuresByLayer.has(layerId)) {
                const node = visibleLayers.find((n) => n.id === layerId);
                featuresByLayer.set(layerId, {
                    layerName: node?.title ?? layerId,
                    features: [],
                });
            }
            featuresByLayer.get(layerId)!.features.push(feature);
        }

        const result: Feature[] = [];
        for (const [layerId, data] of featuresByLayer) {
            const firstFeature = data.features[0];
            if (!firstFeature) continue;

            const attributes = this.buildAttributes(firstFeature);

            result.push({
                id: `${layerId}_${firstFeature.id ?? 0}`,
                layerId,
                layerName: data.layerName,
                sourceType: "vector",
                attributes,
                groupId: layerId,
            });
        }

        return result;
    }

    /**
     * Build attributes object from a Maplibre feature.
     */
    private buildAttributes(
        feature: maplibregl.MapGeoJSONFeature,
    ): Record<string, unknown> {
        const attributes: Record<string, unknown> = {
            ...feature.properties,
            sourceLayer: feature.sourceLayer ?? "",
        };

        if (feature.geometry) {
            attributes.geometryType = feature.geometry.type;
        }

        return attributes;
    }
}
