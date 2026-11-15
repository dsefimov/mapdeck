import type { AssetContext, SourceAsset } from "@core/contracts";

/**
 * The params every rule starts from: the asset's display name and its
 * declared MIME type. Rule-specific keys spread on top.
 */
export function baseAssetParams(
    asset: SourceAsset,
    ctx: AssetContext,
): Record<string, unknown> {
    return {
        title: asset.title ?? ctx.assetKey,
        ...(asset.type ? { mimeType: asset.type } : {}),
    };
}
