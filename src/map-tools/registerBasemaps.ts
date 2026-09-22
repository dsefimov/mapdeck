import type { StoreRegistry } from "@core/store-registry";
import type { BaseMapConfig } from "@core/contracts";
import { boundedFetch } from "@core/lib/async";
import { loadBasemapConfigs } from "./basemap/loadBasemapConfigs";

/** A style definition must not hang the registration step. */
const STYLE_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetches styles for configs that declare a `styleUrl` without an inline
 * style, so the health check sees real data. A failed fetch keeps the style
 * undefined — the config shows as unavailable.
 */
async function fetchExternalStyles(configs: BaseMapConfig[]): Promise<void> {
    await Promise.all(
        configs.map(async (bm) => {
            const styleUrl = bm.styleUrl;
            if (!styleUrl || bm.style) return;
            try {
                const response = await boundedFetch(styleUrl, {
                    timeoutMs: STYLE_FETCH_TIMEOUT_MS,
                });
                if (response.ok) {
                    bm.style = await response.json();
                }
            } catch {
                // Keep style undefined — health check will mark it unavailable.
            }
        }),
    );
}

/** Explicit registration of the built-in basemap configs. */
export async function registerBasemaps(
    rootStore: StoreRegistry,
    tileOverrides: Readonly<Record<string, readonly string[]>> = {},
): Promise<void> {
    // Copies, not the shared asset object — the fetched styles must not
    // leak back into the module singleton other importers receive.
    const basemapConfigs = loadBasemapConfigs().map((bm) => ({
        ...bm,
    }));
    applyTileOverrides(basemapConfigs, tileOverrides);
    await fetchExternalStyles(basemapConfigs);
    rootStore.basemapStore.registerConfigs(basemapConfigs);
}

/**
 * Replace a basemap's raster tile URLs from the deployment's runtime
 * config — a site serves its own tile cache without a rebuild. Untyped
 * members of the MapLibre style stay untouched; only `tiles` is swapped.
 */
export function applyTileOverrides(
    configs: BaseMapConfig[],
    overrides: Readonly<Record<string, readonly string[]>>,
): void {
    for (const config of configs) {
        const tiles = overrides[config.id];
        const style = config.style;
        if (!tiles || !style) continue;
        const sources: NonNullable<BaseMapConfig["style"]>["sources"] = {};
        for (const [name, source] of Object.entries(style.sources)) {
            sources[name] =
                source && "tiles" in source
                    ? { ...source, tiles: [...tiles] }
                    : source;
        }
        config.style = { ...style, sources };
    }
}
