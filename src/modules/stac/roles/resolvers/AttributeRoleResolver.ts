import type {
    AssetContext,
    AssetRule,
    ProtocolAssignment,
    SourceAsset,
} from "@core/contracts";
import { baseAssetParams } from "../baseAssetParams";

const ATTRIBUTE_ROLES = new Set(["wfs", "ogc-feature-api"]);

export class AttributeRoleResolver implements AssetRule {
    readonly priority = 10;

    canResolve(asset: SourceAsset, _ctx: AssetContext): boolean {
        return asset.roles?.some((r) => ATTRIBUTE_ROLES.has(r)) ?? false;
    }

    resolve(asset: SourceAsset, ctx: AssetContext): ProtocolAssignment {
        const adapterType =
            asset.roles?.find((r) => ATTRIBUTE_ROLES.has(r)) ?? "wfs";
        const protocolId =
            adapterType === "ogc-feature-api" ? "ogc-features" : "wfs";

        return {
            protocolId,
            sourceUrl: asset.href,
            params: baseAssetParams(asset, ctx),
        };
    }
}
