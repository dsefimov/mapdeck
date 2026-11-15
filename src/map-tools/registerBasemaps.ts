import type { StoreRegistry } from "@core/store-registry";
import { loadBasemapConfigs } from "./basemap/loadBasemapConfigs";

/**
 * Explicit registration of the built-in basemap set — the composition-root
 * step modules' registrations follow. Everything a config needs (validation,
 * style-Url fetch, duplicate policy, setting repair) lives in the store's
 * registration path, shared by both channels.
 */
export async function registerBasemaps(
    rootStore: StoreRegistry,
): Promise<void> {
    await rootStore.basemapStore.registerConfigs(loadBasemapConfigs());
}
