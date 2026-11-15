import type {
    AssetContext,
    AssetRule,
    ProtocolAssignment,
    SourceAsset,
} from "@core/contracts";
import { isReportAsset } from "../../assets/AssetClassifier";
import { baseAssetParams } from "../baseAssetParams";

export class ReportRoleResolver implements AssetRule {
    readonly priority = 0;

    canResolve(asset: SourceAsset, _ctx: AssetContext): boolean {
        return isReportAsset(asset);
    }

    resolve(asset: SourceAsset, ctx: AssetContext): ProtocolAssignment {
        return {
            protocolId: "report",
            sourceUrl: asset.href,
            params: baseAssetParams(asset, ctx),
        };
    }
}
