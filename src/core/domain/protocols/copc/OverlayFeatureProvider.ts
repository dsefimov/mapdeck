import { getPointFromPickingInfo, findPointCloudDataAdapter } from "@core/contracts";
import type {
    FeatureProvider,
    Feature,
    CollectParams,
    MapContext,
    ProtocolRegistry,
} from "@core/contracts";

/** Tighter radius for the multi-pick used to list features under the cursor. */
const FEATURE_PICK_RADIUS_PX = 5;

/** Deck picking type through the port's return types. */
type PickingInfo = NonNullable<
    ReturnType<MapContext["overlayManager"]["pickObject"]>
>;

const FEATURE_INFO_LAYER_PREFIX = "feature-info-";

/**
 * Feature provider for overlay-rendered layers (COPC point clouds): picks
 * the features under the cursor through the map context's overlay port and
 * attributes them back to their base layers.
 */
export class OverlayFeatureProvider implements FeatureProvider {
    constructor(
        private readonly getMapContext: () => MapContext | null,
        private readonly registry: ProtocolRegistry,
    ) {}

    collect(params: CollectParams): Feature[] {
        const { screenX, screenY, visibleLayers } = params;
        const ctx = this.getMapContext();
        if (!ctx) return [];

        const overlayManager = ctx.overlayManager;
        const results = overlayManager.pickObjects(screenX, screenY, FEATURE_PICK_RADIUS_PX);
        if (!results || results.length === 0) return [];

        const visibleIds = new Set(visibleLayers.map((n) => n.id));
        const seen = new Set<string>();
        const features: Feature[] = [];

        for (const pickingInfo of results) {
            const resolved = this._resolvePickedLayer(
                pickingInfo,
                visibleIds,
                visibleLayers,
            );
            if (!resolved) continue;

            const featureId = this._getFeatureId(pickingInfo);
            const dedupKey = `${resolved.baseLayerId}_${featureId}`;
            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);

            const result = this._buildFeature(
                pickingInfo,
                resolved.baseLayerId,
                resolved.layerName,
            );
            features.push(...result);
        }

        return features;
    }

    private _getFeatureId(pickingInfo: PickingInfo): string {
        const obj = pickingInfo.object as Record<string, unknown> | undefined;
        const id = obj?.id ?? pickingInfo.index;
        return id?.toString() ?? "0";
    }

    private _resolvePickedLayer(
        pickingInfo: PickingInfo,
        visibleIds: Set<string>,
        visibleLayers: CollectParams["visibleLayers"],
    ): { baseLayerId: string; layerName: string } | null {
        if (!pickingInfo.layer?.id) return null;
        const layerId = pickingInfo.layer.id;
        if (layerId.startsWith(FEATURE_INFO_LAYER_PREFIX)) return null;

        const baseLayerId = this._resolveLayerId(layerId, visibleIds);
        if (!baseLayerId) return null;

        const node = visibleLayers.find((n) => n.id === baseLayerId);
        return { baseLayerId, layerName: node?.title ?? baseLayerId };
    }

    private _resolveLayerId(
        pickedId: string,
        visibleIds: Set<string>,
    ): string | null {
        if (visibleIds.has(pickedId)) return pickedId;

        // Render units suffix their layers ("{id}-suffix"), so the prefix
        // must end at a boundary — a raw startsWith would also match an id
        // that is merely a string prefix of another layer's id.
        for (const id of visibleIds) {
            if (
                pickedId.length > id.length &&
                pickedId.startsWith(id) &&
                pickedId[id.length] === "-"
            ) {
                return id;
            }
        }

        return null;
    }

    private _getPointCloudData(): (layerId: string) => ReturnType<
        NonNullable<ReturnType<typeof findPointCloudDataAdapter>>["getLoadedData"]
    > {
        return (layerId: string) =>
            findPointCloudDataAdapter(this.registry, layerId)?.getLoadedData(
                layerId,
            );
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
            this._getPointCloudData(),
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
                attributes,
            },
        ];
    }
}
