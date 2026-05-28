import { getPointFromPickingInfo } from "@core/domain/point-cloud/picking";
import type { MapStore } from "@core/framework/store";
import type { LayerAdapterFactory } from "@core/domain/adapters";
import type { FeatureProvider, Feature, CollectParams } from "../types";

/** Prefix used by feature-info tool's own overlay layers */
const FEATURE_INFO_LAYER_PREFIX = "feature-info-";

/**
 * Feature provider for overlay layers (e.g. point clouds rendered on top of the map).
 * Uses overlayManager.pickObject to pick points from overlay renderers.
 */
export class OverlayFeatureProvider implements FeatureProvider {
    constructor(
        private readonly mapStore: MapStore,
        private readonly layerAdapterFactory: LayerAdapterFactory,
    ) {}

    collect(params: CollectParams): Feature[] {
        const { screenX, screenY, visibleLayers } = params;
        const ctx = this.mapStore.context;
        if (!ctx) return [];

        const overlayManager = ctx.overlayManager;

        const pickingInfo = overlayManager.pickObject(screenX, screenY, 5);
        if (!pickingInfo || !pickingInfo.layer?.id) {
            return [];
        }

        const layerId = pickingInfo.layer.id;
        if (layerId.startsWith(FEATURE_INFO_LAYER_PREFIX)) {
            return [];
        }

        const baseLayerId = this.extractBaseLayerId(layerId);
        const visibleLayerIds = new Set(visibleLayers.map((n) => n.id));
        if (!visibleLayerIds.has(baseLayerId)) {
            return [];
        }

        return this.buildFeature(pickingInfo, baseLayerId, visibleLayers);
    }

    /**
     * Build a Feature from picking info.
     */
    private buildFeature(
        pickingInfo: import("@deck.gl/core").PickingInfo,
        baseLayerId: string,
        visibleLayers: import("@core/framework/types").LayerNode[],
    ): Feature[] {
        const pointResult = getPointFromPickingInfo(
            {
                layer: pickingInfo.layer,
                coordinate: pickingInfo.coordinate,
                index: pickingInfo.index,
            },
            this.layerAdapterFactory,
        );
        if (!pointResult) return [];

        const node = visibleLayers.find((n) => n.id === baseLayerId);
        const layerName = node?.title ?? baseLayerId;

        const attributes: Record<string, unknown> = {
            Longitude: pointResult.lng,
            Latitude: pointResult.lat,
            Elevation: pointResult.z,
            ...pointResult.attributes,
        };

        if (attributes.color && Array.isArray(attributes.color)) {
            const c = attributes.color as number[];
            attributes["Color (RGB)"] = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
            delete attributes.color;
        }

        return [
            {
                id: `${baseLayerId}_${pointResult.pointIndex}`,
                layerId: baseLayerId,
                layerName,
                sourceType: "overlay",
                attributes,
                groupId: baseLayerId,
            },
        ];
    }

    /**
     * Extract base layer ID from potentially chunked layer IDs.
     */
    private extractBaseLayerId(layerId: string): string {
        const match = /^(.*)-chunk\d+$/.exec(layerId);
        return match ? match[1]! : layerId;
    }
}
