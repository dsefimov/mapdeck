import type {
    IRoleResolver,
    ResolveContext,
    ProtocolAssignment,
} from "../IRoleResolver";
import type { STACAsset } from "../../types";
import { baseAssetParams } from "../baseAssetParams";

/**
 * GeoJSON for DeckGL.
 * Matches: explicit role "geojson", role "ogc", or specific geo+json MIME.
 * URL: if this is an OGC API Features endpoint, appends /items.
 *
 * Note: "data" role is intentionally excluded — it is too broad and
 * overlaps with COG, GeoTIFF, LAZ, and other formats. GeoJSON detection
 * relies on explicit roles or specific MIME types only.
 */
export class GeoJsonRoleResolver implements IRoleResolver {
    readonly priority = 35;

    canResolve(asset: STACAsset, _ctx: ResolveContext): boolean {
        if (asset.roles?.includes("geojson")) return true;
        if (asset.roles?.includes("ogc")) return true;
        return (
            asset.type === "application/geo+json" ||
            asset.type === "application/vnd.geo+json"
        );
    }

    resolve(asset: STACAsset, ctx: ResolveContext): ProtocolAssignment {
        const protocolId = asset.roles?.includes("ogc")
            ? "ogc-features"
            : "geojson-tiled";
        const sourceUrl = resolveOgcFeaturesUrl(asset.href);

        return {
            protocolId,
            sourceUrl,
            params: baseAssetParams(asset, ctx),
        };
    }
}

/**
 * OGC API Features collection endpoint returns collection metadata, not data.
 * Append /items to obtain a FeatureCollection.
 */
function resolveOgcFeaturesUrl(href: string): string {
    const clean = href.endsWith("/") ? href.slice(0, -1) : href;
    return clean.endsWith("/items") ? href : `${clean}/items`;
}
