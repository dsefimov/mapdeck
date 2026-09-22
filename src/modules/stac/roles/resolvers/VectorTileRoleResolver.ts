import type {
    IRoleResolver,
    ResolveContext,
    ProtocolAssignment,
} from "../IRoleResolver";
import type { STACAsset } from "../../types";
import { baseAssetParams } from "../baseAssetParams";

/**
 * Vector tiles — MapLibre (MVT).
 * Role: "vector-tile".
 * Asset fields "vector:layer" (MVT source layer) and "vector:layer-type"
 * pass through params to the render adapter — MapLibre cannot style a
 * vector layer without a source layer.
 */
export class VectorTileRoleResolver implements IRoleResolver {
    readonly priority = 30;

    canResolve(asset: STACAsset, _ctx: ResolveContext): boolean {
        return asset.roles?.includes("vector-tile") ?? false;
    }

    resolve(asset: STACAsset, ctx: ResolveContext): ProtocolAssignment {
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
