import { LayerRoles, makeRenderDescriptor } from "@core/framework/types";
import type { DisplayRole } from "@core/framework/types";
import type { IRoleResolver, ResolveContext } from "../IRoleResolver";
import type { STACAsset } from "../../types";

/**
 * Handles XYZ raster tiles.
 * Matches: role "raster-tile" (custom) or {z}/{x}/{y} pattern in the URL.
 */
export class RasterTileRoleResolver implements IRoleResolver {
    readonly priority = 20;

    canResolve(asset: STACAsset): boolean {
        const hasRole = asset.roles?.includes("raster-tile") ?? false;
        const isXyz = /\{[zxy]\}/.test(asset.href);
        return hasRole || isXyz;
    }

    resolve(asset: STACAsset, ctx: ResolveContext): DisplayRole {
        const layerConfig = ctx.registry.create(LayerRoles.RASTER);
        const cfg = layerConfig as unknown as Record<string, unknown>;
        cfg.url = asset.href;
        cfg.type = "xyz";

        return {
            id: ctx.assetKey,
            category: "display",
            label: asset.title ?? ctx.assetKey,
            ...(asset.type ? { mimeType: asset.type } : {}),
            render: makeRenderDescriptor(
                LayerRoles.RASTER,
                asset.href,
                layerConfig,
            ),
        };
    }
}
