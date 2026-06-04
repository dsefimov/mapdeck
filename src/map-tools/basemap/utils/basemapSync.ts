import { reaction, type IReactionDisposer } from "mobx";
import type { SettingsStore } from "@core/framework/store/settings/SettingsStore";
import type { MapStore } from "@core/framework/store";

const BASEMAP_SETTING_ID = "basemap.basemap";

/**
 * Manages the reactive sync between the basemap setting and the maplibre map.
 */
export class BasemapSync {
    private _disposer: IReactionDisposer | null = null;

    /**
     * Start watching the basemap setting and apply changes to the map.
     * Safe to call multiple times — previous subscription is disposed first.
     */
    start(settingsStore: SettingsStore, mapStore: MapStore): void {
        this.stop();

        this._disposer = reaction(
            () => settingsStore.getStringSetting(BASEMAP_SETTING_ID),
            () => {
                const basemap = mapStore.activeBasemap;
                if (basemap) mapStore.applyBasemapToMap(basemap);
            },
        );
    }

    /** Tear down the reaction. Safe to call on an already-stopped instance. */
    stop(): void {
        this._disposer?.();
        this._disposer = null;
    }
}
