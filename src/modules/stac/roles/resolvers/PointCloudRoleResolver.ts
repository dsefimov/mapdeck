import { LayerRoles, makeRenderDescriptor, Bbox } from "@core/framework/types";
import type { DisplayRole } from "@core/framework/types";
import type { IRoleResolver, ResolveContext } from "../IRoleResolver";
import type { STACAsset } from "../../types";
import { POINTCLOUD_MIMES } from "../../types/extensions/pointcloud";

/**
 * COPC / LAZ point clouds.
 * Matches:
 *   - role "point-cloud" (custom)
 *   - role "data" + MIME from POINTCLOUD_MIMES
 *   - pc:encoding in properties (pointcloud extension)
 */
export class PointCloudRoleResolver implements IRoleResolver {
    readonly priority = 22;

    canResolve(asset: STACAsset, ctx: ResolveContext): boolean {
        if (asset.roles?.includes("point-cloud")) return true;

        const hasPcMime = !!asset.type && POINTCLOUD_MIMES.has(asset.type);
        const hasDataRole = asset.roles?.includes("data") ?? false;
        if (hasPcMime && hasDataRole) return true;

        // application/octet-stream with pc:encoding in properties
        const hasPcEncoding = !!ctx.properties?.["pc:encoding"];
        return hasPcMime && hasPcEncoding;
    }

    resolve(asset: STACAsset, ctx: ResolveContext): DisplayRole {
        const layerConfig = ctx.registry.create(LayerRoles.POINT_CLOUD);
        const cfg = layerConfig as unknown as Record<string, unknown>;
        cfg.url = asset.href;

        if (ctx.itemBbox) {
            const bbox = new Bbox(ctx.itemBbox);
            cfg.coordinateOrigin = bbox.center;
            if (bbox.is3D) cfg.bounds = bbox.bounds3D;
        }

        return {
            id: ctx.assetKey,
            category: "display",
            label: asset.title ?? ctx.assetKey,
            ...(asset.type ? { mimeType: asset.type } : {}),
            render: makeRenderDescriptor(
                LayerRoles.POINT_CLOUD,
                asset.href,
                layerConfig,
            ),
        };
    }
}
