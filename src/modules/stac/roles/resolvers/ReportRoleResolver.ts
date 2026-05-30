import type { ReportRole } from "@core/framework/types";
import type { IRoleResolver, ResolveContext } from "../IRoleResolver";
import type { STACAsset } from "../../types";
import { isReportAsset } from "../../assets/AssetClassifier";

export class ReportRoleResolver implements IRoleResolver {
  readonly priority = 0;

  canResolve(asset: STACAsset): boolean {
    return isReportAsset(asset);
  }

  resolve(asset: STACAsset, ctx: ResolveContext): ReportRole {
    const result: ReportRole = {
      id: ctx.assetKey,
      category: "report",
      label: asset.title ?? ctx.assetKey,
      sourceUrl: asset.href,
    };
    if (asset.type) result.mimeType = asset.type;
    return result;
  }
}
