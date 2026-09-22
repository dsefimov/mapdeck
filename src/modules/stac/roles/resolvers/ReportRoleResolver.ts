import type {
    IRoleResolver,
    ResolveContext,
    ProtocolAssignment,
} from "../IRoleResolver";
import type { STACAsset } from "../../types";
import { isReportAsset } from "../../assets/AssetClassifier";
import { baseAssetParams } from "../baseAssetParams";

export class ReportRoleResolver implements IRoleResolver {
    readonly priority = 0;

    canResolve(asset: STACAsset, _ctx: ResolveContext): boolean {
        return isReportAsset(asset);
    }

    resolve(asset: STACAsset, ctx: ResolveContext): ProtocolAssignment {
        return {
            protocolId: "report",
            sourceUrl: asset.href,
            params: baseAssetParams(asset, ctx),
        };
    }
}
