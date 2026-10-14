import type {
    AssetContext,
    AssetRule,
    ProtocolAssignment,
    SourceAsset,
} from "@core/contracts";
import { baseAssetParams } from "../baseAssetParams";
import { logger } from "@core/lib/logger";
import { parseUrl } from "@core/lib/url/parseUrl";

/** What a full GetMap href splits into at the source boundary. */
interface SplitGetMapUrl {
    baseUrl: string;
    layers?: string | undefined;
    styles?: string | undefined;
    version?: string | undefined;
    format?: string | undefined;
}

/**
 * Split a WMS asset href at the source boundary (the binding's
 * URL is the clean endpoint, params are the single source of truth for
 * request parameters). Static catalogs often embed a full GetMap URL —
 * LAYERS/STYLES/VERSION/FORMAT move into params; unrecognized vendor
 * parameters are dropped. An href that does not parse into a plain
 * HTTP(S) URL yields an empty endpoint — a broken asset stays visible
 * in the log instead of leaking a raw string into the network layer.
 */
function splitGetMapUrl(href: string): SplitGetMapUrl {
    try {
        const parsed = parseUrl(href);
        const query = (name: string): string | undefined =>
            parsed.searchParams.get(name) ?? undefined;
        const split: SplitGetMapUrl = {
            baseUrl: "",
            layers: query("LAYERS"),
            styles: query("STYLES"),
            version: query("VERSION"),
            format: query("FORMAT"),
        };
        parsed.search = "";
        split.baseUrl = parsed.toString();
        return split;
    } catch (error) {
        logger.warn(
            `WmsRoleResolver: unparseable WMS href "${href}": ${error}`,
        );
        return { baseUrl: "" };
    }
}

export class WmsRoleResolver implements AssetRule {
    readonly priority = 25;

    canResolve(asset: SourceAsset, _ctx: AssetContext): boolean {
        return asset.roles?.includes("wms") ?? false;
    }

    resolve(asset: SourceAsset, ctx: AssetContext): ProtocolAssignment {
        const split = splitGetMapUrl(asset.href);
        // Query parameters win over the asset fields — one precedence,
        // everywhere the layers are read.
        const layers = split.layers ?? asset["wms:layers"];
        const styles = split.styles ?? asset["wms:styles"];

        const params: Record<string, unknown> = {
            ...baseAssetParams(asset, ctx),
            ...(layers ? { layers } : {}),
            ...(styles ? { styles } : {}),
            ...(split.version ? { version: split.version } : {}),
            ...(split.format ? { format: split.format } : {}),
        };

        return {
            protocolId: "wms",
            sourceUrl: split.baseUrl,
            params,
        };
    }
}
