import { LayerRoles, makeRenderDescriptor } from "@core/framework/types";
import type { DisplayRole } from "@core/framework/types";
import type { IRoleResolver, ResolveContext } from "../IRoleResolver";
import type { STACAsset } from "../../types";

/**
 * Vector tiles — MapLibre (MVT).
 * Role: "vector-tile".
 * LayerRoles.VECTOR → rendered via MapLibre vector tile layer.
 */
export class VectorTileRoleResolver implements IRoleResolver {
    readonly priority = 30;

    canResolve(asset: STACAsset): boolean {
        return asset.roles?.includes("vector-tile") ?? false;
    }

    resolve(asset: STACAsset, ctx: ResolveContext): DisplayRole {
        const layerConfig = ctx.registry.create(LayerRoles.VECTOR);
        const cfg = layerConfig as unknown as Record<string, unknown>;
        cfg.url = asset.href;

        return {
            id: ctx.assetKey,
            category: "display",
            label: asset.title ?? ctx.assetKey,
            ...(asset.type ? { mimeType: asset.type } : {}),
            render: makeRenderDescriptor(
                LayerRoles.VECTOR,
                asset.href,
                layerConfig,
            ),
        };
    }
}
