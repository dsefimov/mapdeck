import { getPointFromPickingInfo } from "@core/domain/point-cloud/picking";
import type { MapStore } from "@core/framework/store";
import type { LayerAdapterFactory } from "@core/domain/adapters";
import type { FeatureProvider, Feature, CollectParams } from "../types";
import type { PickingInfo } from "@deck.gl/core";

const FEATURE_INFO_LAYER_PREFIX = "feature-info-";

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
        if (!pickingInfo || !pickingInfo.layer?.id) return [];

        const layerId = pickingInfo.layer.id;
        if (layerId.startsWith(FEATURE_INFO_LAYER_PREFIX)) return [];

        const visibleIds = new Set(visibleLayers.map((n) => n.id));
        const baseLayerId = this._resolveLayerId(layerId, visibleIds);
        if (!baseLayerId) return [];

        const node = visibleLayers.find((n) => n.id === baseLayerId);
        const layerName = node?.title ?? baseLayerId;

        return this._buildFeature(pickingInfo, baseLayerId, layerName);
    }

    private _resolveLayerId(
        pickedId: string,
        visibleIds: Set<string>,
    ): string | null {
        if (visibleIds.has(pickedId)) return pickedId;

        const match = /^(.*)-chunk\d+$/.exec(pickedId);
        const stripped = match ? match[1]! : pickedId;
        if (visibleIds.has(stripped)) return stripped;

        for (const id of visibleIds) {
            if (pickedId.startsWith(id)) return id;
        }

        return null;
    }

    private _buildFeature(
        pickingInfo: PickingInfo,
        layerId: string,
        layerName: string,
    ): Feature[] {
        const pointResult = getPointFromPickingInfo(
            {
                layer: pickingInfo.layer,
                coordinate: pickingInfo.coordinate,
                index: pickingInfo.index,
            },
            this.layerAdapterFactory,
        );
        if (pointResult) {
            return this._makeFeature(
                layerId,
                layerName,
                `${pointResult.pointIndex}`,
                {
                    Longitude: pointResult.lng,
                    Latitude: pointResult.lat,
                    Elevation: pointResult.z,
                    ...pointResult.attributes,
                },
            );
        }

        return this._extractObjectFeature(pickingInfo, layerId, layerName);
    }

    private _extractObjectFeature(
        pickingInfo: PickingInfo,
        layerId: string,
        layerName: string,
    ): Feature[] {
        const obj = pickingInfo.object;
        if (obj == null) return [];

        const record = obj as Record<string, unknown>;
        const featureId = (record.id ?? pickingInfo.index)?.toString() ?? "0";
        const attributes: Record<string, unknown> = {};

        if (record.properties && typeof record.properties === "object") {
            Object.assign(
                attributes,
                record.properties as Record<string, unknown>,
            );
        }
        const geom = record.geometry as Record<string, unknown> | undefined;
        if (geom?.type && typeof geom.type === "string") {
            attributes.geometryType = geom.type;
        }

        return this._makeFeature(layerId, layerName, featureId, attributes);
    }

    private _makeFeature(
        layerId: string,
        layerName: string,
        featureId: string,
        attributes: Record<string, unknown>,
    ): Feature[] {
        return [
            {
                id: `${layerId}_${featureId}`,
                layerId,
                layerName,
                sourceType: "overlay",
                attributes,
                groupId: layerId,
            },
        ];
    }
}
