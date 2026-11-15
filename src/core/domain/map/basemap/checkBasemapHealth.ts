import type { BaseMapConfig } from "@core/contracts";
import { boundedFetch } from "@core/lib/async";

/**
 * Basemap health-probe timeout. Single source for the check default and the
 * store's pass-through default — a duplicate literal here and in BasemapStore
 * would drift apart silently.
 */
export const DEFAULT_PROBE_TIMEOUT_MS = 3000;

/**
 * Check whether a basemap is reachable.
 *
 * Builds a tile URL from the first source in the style fragment
 * (z=0/x=0/y=0 for "tiles" templates, raw URL for "url"-based sources)
 * and issues a HEAD request. Works identically for raster, vector,
 * and PMTiles sources.
 */
export async function checkBasemapHealth(
    basemap: BaseMapConfig,
    timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<boolean> {
    const sources = basemap.style?.sources;
    if (!sources) return false;

    const firstSource = Object.values(sources)[0] as
        | Record<string, unknown>
        | undefined;
    if (!firstSource) return false;

    const checkUrl = resolveCheckUrl(firstSource);
    if (!checkUrl) return false;

    try {
        const response = await boundedFetch(checkUrl, {
            method: "HEAD",
            timeoutMs,
        });
        // 405/501: the route exists but HEAD is unsupported — the server is
        // reachable, which is all this probe claims to check.
        return (
            response.ok ||
            response.status === 206 ||
            response.status === 405 ||
            response.status === 501
        );
    } catch {
        return false;
    }
}

/** Build the URL to probe from a source spec. */
function resolveCheckUrl(source: Record<string, unknown>): string | null {
    const tiles = source.tiles as string[] | undefined;
    const firstTile = tiles?.[0];
    if (firstTile) {
        return firstTile
            .replace(/{z}/g, "0")
            .replace(/{x}/g, "0")
            .replace(/{y}/g, "0");
    }

    const srcUrl = source.url as string | undefined;
    if (srcUrl) return stripPmtilesProtocol(srcUrl);

    return null;
}

/** pmtiles:// URLs use a custom protocol unknown to browser fetch — extract the real HTTP path. */
function stripPmtilesProtocol(url: string): string {
    if (url.startsWith("pmtiles://")) {
        return url.slice("pmtiles://".length);
    }
    return url;
}
