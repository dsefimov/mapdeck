import { RootStore } from "@core/framework/store";
import maplibregl from "maplibre-gl";
import { findValidBasemap } from "@map-tools/basemap/utils/basemapSettings";
import { BasemapSync } from "@map-tools/basemap/utils/basemapSync";

/** Find a healthy basemap, apply it to the map, and start reactive sync. */
export async function initBasemap(
    rootStore: RootStore,
    map: maplibregl.Map,
): Promise<void> {
    const validBasemap = await findValidBasemap(rootStore);
    if (!validBasemap) return;

    const current = rootStore.mapStore.activeBasemap;
    if (validBasemap.id !== current?.id) {
        rootStore.mapStore.setActiveBasemap(validBasemap.id);
    }

    rootStore.mapStore.applyBasemapToMap(validBasemap);

    const sync = new BasemapSync();
    sync.start(rootStore.settingsStore, rootStore.mapStore);
    map.once("remove", () => sync.stop());
}
