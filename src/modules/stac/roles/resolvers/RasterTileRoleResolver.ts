import type {
    AssetContext,
    AssetRule,
    ProtocolAssignment,
    SourceAsset,
} from "@core/contracts";
import { baseAssetParams } from "../baseAssetParams";

/** MIME of Mapbox Vector Tiles — their URLs share the {z}/{x}/{y} shape. */
const MVT_MIME = "application/vnd.mapbox-vector-tile";

/**
 * Handles XYZ raster tiles.
 * Matches: role "raster-tile" (custom) or {z}/{x}/{y} pattern in the URL —
 * but the URL heuristic never applies to vector-tile assets: this resolver
 * runs at a lower priority number than VectorTileRoleResolver, so without
 * the guard it would claim MVT templates first.
 */
export class RasterTileRoleResolver implements AssetRule {
    readonly priority = 20;

    canResolve(asset: SourceAsset, _ctx: AssetContext): boolean {
        if (asset.roles?.includes("raster-tile")) return true;
        if (asset.roles?.includes("vector-tile")) return false;
        if (asset.type === MVT_MIME) return false;
        return /\{z\}\/\{x\}\/\{y\}/.test(asset.href);
    }

    resolve(asset: SourceAsset, ctx: AssetContext): ProtocolAssignment {
        return {
            protocolId: "xyz",
            sourceUrl: asset.href,
            params: {
                ...baseAssetParams(asset, ctx),
                ...(typeof asset["raster:max-zoom"] === "number"
                    ? { maxzoom: asset["raster:max-zoom"] }
                    : {}),
            },
        };
    }
}
