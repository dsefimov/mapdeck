import { LayerRoles, makeRenderDescriptor } from "@core/framework/types";
import type { DisplayRole } from "@core/framework/types";
import type { IRoleResolver, ResolveContext } from "../IRoleResolver";
import type { STACAsset } from "../../types";

export class WmsRoleResolver implements IRoleResolver {
    readonly priority = 25;

    canResolve(asset: STACAsset): boolean {
        return asset.roles?.includes("wms") ?? false;
    }

    resolve(asset: STACAsset, ctx: ResolveContext): DisplayRole {
        const layerConfig = ctx.registry.create(LayerRoles.RASTER);
        const cfg = layerConfig as unknown as Record<string, unknown>;
        cfg.url = asset.href;
        cfg.type = "wms";
        // wms:layers from WMS Extension (preferred) or LAYERS from URL
        if (asset["wms:layers"]) cfg.layers = asset["wms:layers"];
        if (asset["wms:styles"]) cfg.styles = asset["wms:styles"];

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
