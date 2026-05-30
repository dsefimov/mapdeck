import type maplibregl from "maplibre-gl";
import { logger } from "@core/shared/diagnostics/logger";
import type { FeatureProvider, Feature, CollectParams } from "../types";
import {
    isVectorConfig,
    isGeoJsonConfig,
    type LayerNode,
} from "@core/framework/types";

/**
 * Feature provider for vector layers rendered natively by the base map.
 * Uses map.queryRenderedFeatures to query vector and non-WMS raster layers.
 */
export class VectorFeatureProvider implements FeatureProvider {
    async collect(params: CollectParams): Promise<Feature[]> {
        const { screenX, screenY, map, visibleLayers } = params;

        const nativeLayerIds = this.getNativeLayerIds(visibleLayers);
        if (nativeLayerIds.length === 0) {
            return [];
        }

        try {
            const allFeatures = map.queryRenderedFeatures([screenX, screenY]);
            const features = allFeatures.filter((f) =>
                nativeLayerIds.includes(f.layer.id),
            );

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
            if (!node.roles.display) continue;
            const config = node.roles.display.render.config;

            if (isVectorConfig(config) || isGeoJsonConfig(config)) {
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
            for (let i = 0; i < data.features.length; i++) {
                const feature = data.features[i];
                if (!feature) continue;

                const attributes = this.buildAttributes(feature);
                const featureId = `${layerId}_${feature.id ?? i}`;

                result.push({
                    id: featureId,
                    layerId,
                    layerName: data.layerName,
                    sourceType: "vector",
                    attributes,
                    groupId: layerId,
                });
            }
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
