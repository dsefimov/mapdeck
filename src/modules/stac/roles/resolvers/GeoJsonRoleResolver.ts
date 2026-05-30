import { LayerRoles, makeRenderDescriptor } from "@core/framework/types";
import type { DisplayRole } from "@core/framework/types";
import type { IRoleResolver, ResolveContext } from "../IRoleResolver";
import type { STACAsset } from "../../types";

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

    canResolve(asset: STACAsset): boolean {
        if (asset.roles?.includes("geojson")) return true;
        if (asset.roles?.includes("ogc")) return true;
        // Explicit geo+json MIME only — application/json is too broad
        return (
            asset.type === "application/geo+json" ||
            asset.type === "application/vnd.geo+json"
        );
    }

    resolve(asset: STACAsset, ctx: ResolveContext): DisplayRole {
        const sourceUrl = resolveOgcFeaturesUrl(asset.href);
        const layerConfig = ctx.registry.create(LayerRoles.GEOJSON);
        const cfg = layerConfig as unknown as Record<string, unknown>;
        cfg.url = sourceUrl;

        return {
            id: ctx.assetKey,
            category: "display",
            label: asset.title ?? ctx.assetKey,
            ...(asset.type ? { mimeType: asset.type } : {}),
            render: makeRenderDescriptor(
                LayerRoles.GEOJSON,
                sourceUrl,
                layerConfig,
            ),
        };
    }
}

/**
 * OGC API Features collection endpoint returns collection metadata, not data.
 * Append /items to obtain a FeatureCollection.
 */
export function resolveOgcFeaturesUrl(href: string): string {
    const clean = href.endsWith("/") ? href.slice(0, -1) : href;
    return clean.endsWith("/items") ? href : `${clean}/items`;
}
