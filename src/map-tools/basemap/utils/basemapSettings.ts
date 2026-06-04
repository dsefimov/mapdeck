import type { BaseMapConfig } from "@core/framework/types";
import type { RootStore } from "@core/framework/store";
import { checkBasemapHealth } from "./checkBasemapHealth";

/**
 * Find a valid (reachable) basemap, preferring the current active one.
 * Falls back to the first healthy basemap in the available list.
 * Returns undefined only when the list is empty.
 */
export async function findValidBasemap(
    rootStore: RootStore,
): Promise<BaseMapConfig | undefined> {
    const available = rootStore.mapStore.availableBasemaps;
    if (available.length === 0) return undefined;

    const activeBasemap = rootStore.mapStore.activeBasemap;

    const candidates = activeBasemap
        ? [
              activeBasemap,
              ...available.filter((bm) => bm.id !== activeBasemap.id),
          ]
        : available;

    for (const basemap of candidates) {
        const healthy = await checkBasemapHealth(basemap.url);
        if (healthy) return basemap;
    }

    return activeBasemap ?? available[0];
}
