import type maplibregl from "maplibre-gl";
import { logger } from "@core/lib/logger";
import type {
    LayerNode,
    FeatureProvider,
    Feature,
    CollectParams,
} from "@core/contracts";

/**
 * Feature provider for layers rendered natively by the base map.
 * Uses map.queryRenderedFeatures with the `{layers}` filter to query them.
 */
export class VectorFeatureProvider implements FeatureProvider {
    constructor(
        /**
         * Protocol ids whose layers render as native maplibre layers — their
         * node ids are the maplibre layer ids. Injected by the composition
         * root so the provider itself stays protocol-agnostic.
         */
        private readonly nativeProtocolIds: ReadonlySet<string>,
    ) {}

    async collect(params: CollectParams): Promise<Feature[]> {
        const { screenX, screenY, map, visibleLayers } = params;

        const nativeLayerIds = visibleLayers
            .filter((n) => this.nativeProtocolIds.has(n.renderer.protocolId))
            .map((n) => n.id)
            // maplibre throws when options.layers names an id missing from
            // the style — a visible node can race its layer's addition.
            .filter((id) => map.getLayer(id) !== undefined);
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
                    attributes,
                });
            }
        }

        return result;
    }

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
