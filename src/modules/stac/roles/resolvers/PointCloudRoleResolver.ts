import { bboxFromTuple } from "@core/lib/geo";
import type {
    AssetContext,
    AssetRule,
    ProtocolAssignment,
    SourceAsset,
} from "@core/contracts";
import { POINTCLOUD_MIMES } from "../../types/extensions/pointcloud";
import { baseAssetParams } from "../baseAssetParams";

/**
 * COPC / LAZ point clouds.
 * Matches:
 *   - role "point-cloud" (custom)
 *   - role "data" + MIME from POINTCLOUD_MIMES (laszip, copc)
 *   - application/octet-stream only when role "data" AND pc:encoding in properties
 */
export class PointCloudRoleResolver implements AssetRule {
    readonly priority = 22;

    canResolve(asset: SourceAsset, ctx: AssetContext): boolean {
        if (asset.roles?.includes("point-cloud")) return true;

        const hasDataRole = asset.roles?.includes("data") ?? false;
        if (!hasDataRole) return false;

        if (asset.type && POINTCLOUD_MIMES.has(asset.type)) return true;

        const isOctetStream = asset.type === "application/octet-stream";
        return isOctetStream && !!ctx.properties?.["pc:encoding"];
    }

    resolve(asset: SourceAsset, ctx: AssetContext): ProtocolAssignment {
        const params: Record<string, unknown> = baseAssetParams(asset, ctx);

        const bbox = bboxFromTuple(ctx.itemBbox);
        if (bbox) {
            params.coordinateOrigin = bbox.center;
            if (bbox.is3D) params.bounds = bbox.bounds3D;
        }

        return {
            protocolId: "copc",
            sourceUrl: asset.href,
            params,
        };
    }
}
