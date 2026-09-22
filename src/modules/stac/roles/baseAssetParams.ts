import type { STACAsset } from "../types";
import type { ResolveContext } from "./IRoleResolver";

/**
 * The params every resolver starts from: the asset's display name and its
 * declared MIME type. Role-specific keys spread on top.
 */
export function baseAssetParams(
    asset: STACAsset,
    ctx: ResolveContext,
): Record<string, unknown> {
    return {
        title: asset.title ?? ctx.assetKey,
        ...(asset.type ? { mimeType: asset.type } : {}),
    };
}
