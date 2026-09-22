import type {
    IRoleResolver,
    ResolveContext,
    ProtocolAssignment,
} from "../IRoleResolver";
import type { STACAsset } from "../../types";
import { baseAssetParams } from "../baseAssetParams";

const ATTRIBUTE_ROLES = new Set(["wfs", "ogc-feature-api"]);

export class AttributeRoleResolver implements IRoleResolver {
    readonly priority = 10;

    canResolve(asset: STACAsset, _ctx: ResolveContext): boolean {
        return asset.roles?.some((r) => ATTRIBUTE_ROLES.has(r)) ?? false;
    }

    resolve(asset: STACAsset, ctx: ResolveContext): ProtocolAssignment {
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
