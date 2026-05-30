import { LayerRoles, makeRenderDescriptor } from "@core/framework/types";
import type { DisplayRole } from "@core/framework/types";
import type { IRoleResolver, ResolveContext } from "../IRoleResolver";
import type { STACAsset } from "../../types";

const GEOJSON_MIMES = new Set([
    "application/geo+json",
    "application/json",
    "application/vnd.geo+json",
]);

const OGC_ROLES = new Set(["ogc", "data"]);

/**
 * GeoJSON for DeckGL.
 * Matches: role "ogc" or "data" + GeoJSON MIME, or explicit "geojson" role.
 * URL: if this is an OGC API Features endpoint, appends /items.
 */
export class GeoJsonRoleResolver implements IRoleResolver {
    readonly priority = 35;

    canResolve(asset: STACAsset): boolean {
        if (asset.roles?.includes("geojson")) return true;
        const hasOgcRole = asset.roles?.some((r) => OGC_ROLES.has(r)) ?? false;
        const hasGeojsonMime = !!asset.type && GEOJSON_MIMES.has(asset.type);
        return hasOgcRole && hasGeojsonMime;
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
function resolveOgcFeaturesUrl(href: string): string {
    const clean = href.endsWith("/") ? href.slice(0, -1) : href;
    return clean.endsWith("/items") ? href : `${clean}/items`;
}
