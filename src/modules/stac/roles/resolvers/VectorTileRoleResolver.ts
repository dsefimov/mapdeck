import type {
    AssetContext,
    AssetRule,
    ProtocolAssignment,
    SourceAsset,
} from "@core/contracts";
import { baseAssetParams } from "../baseAssetParams";

/**
 * Vector tiles — MapLibre (MVT).
 * Role: "vector-tile".
 * Asset fields "vector:layer" (MVT source layer) and "vector:layer-type"
 * pass through params to the render adapter — MapLibre cannot style a
 * vector layer without a source layer.
 */
export class VectorTileRoleResolver implements AssetRule {
    readonly priority = 30;

    canResolve(asset: SourceAsset, _ctx: AssetContext): boolean {
        return asset.roles?.includes("vector-tile") ?? false;
    }

    resolve(asset: SourceAsset, ctx: AssetContext): ProtocolAssignment {
        return {
            protocolId: "vector-tile",
            sourceUrl: asset.href,
            params: {
                ...baseAssetParams(asset, ctx),
                ...(asset["vector:layer"]
                    ? { sourceLayer: asset["vector:layer"] }
                    : {}),
                ...(asset["vector:layer-type"]
                    ? { layerType: asset["vector:layer-type"] }
                    : {}),
                ...(typeof asset["vector:max-zoom"] === "number"
                    ? { maxzoom: asset["vector:max-zoom"] }
                    : {}),
            },
        };
    }
}
