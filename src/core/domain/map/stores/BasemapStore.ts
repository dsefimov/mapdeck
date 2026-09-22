import {
    makeAutoObservable,
    observable,
    reaction,
    runInAction,
    type IReactionDisposer,
} from "mobx";
import type { StoreRegistry } from "@core/store-registry";
import type { BaseMapConfig, BasemapStatus } from "@core/contracts";
import {
    checkBasemapHealth,
    DEFAULT_PROBE_TIMEOUT_MS,
} from "../basemap/checkBasemapHealth";
import { pickInitialBasemap } from "../logic/pickInitialBasemap";
import { withSourceAttribution } from "../logic/withSourceAttribution";
import { logger } from "@core/lib/logger";

/** Single owner of the basemap setting key — tools import it, never re-declare. */
export const BASEMAP_SETTING_ID = "basemap.basemap";
const BASEMAP_ID_PREFIX = "basemap_";

export class BasemapStore {
    private _configs: BaseMapConfig[] = [];
    /** Last known health per basemap id — sticky for the session. */
    readonly healthStatuses = observable.map<string, BasemapStatus>();
    private _ownedIds: Set<string> = new Set();
    /** Last successfully applied config — the rollback target of a failed switch. */
    private _lastApplied: BaseMapConfig | undefined;
    private _syncDisposer: IReactionDisposer | null = null;
    private _initInProgress = false;

    constructor(readonly rootStore: StoreRegistry) {
        makeAutoObservable<this, "healthStatuses">(this, {
            rootStore: false,
            healthStatuses: false,
        });
    }

    /**
     * Register basemap configs. Additive — new configs are appended
     * (duplicates by id are skipped). Re-syncs the setting options
     * so modules can register configs after init.
     */
    registerConfigs(configs: BaseMapConfig[]): void {
        for (const config of configs) {
            if (!this._configs.some((c) => c.id === config.id)) {
                this._configs.push(config);
            }
        }
        this._syncSettingOptions();
    }

    /** All registered basemap configs (no filtering). */
    get availableBasemaps(): BaseMapConfig[] {
        return this._configs;
    }

    /** Currently active basemap config, resolved from the setting. */
    get activeBasemap(): BaseMapConfig | undefined {
        const id =
            this.rootStore.settingsStore.getStringSetting(BASEMAP_SETTING_ID);
        if (!id) return undefined;
        return this._configs.find((bm) => bm.id === id);
    }

    /** Switch the active basemap setting. */
    setActiveBasemap(basemapId: string): void {
        this.rootStore.settingsStore.setSetting(BASEMAP_SETTING_ID, basemapId);
    }

    /**
     * Probe every registered basemap without a recorded status yet,
     * concurrently and idempotently — repeated calls never re-probe.
     */
    refreshHealthStatuses(): void {
        for (const config of this._configs) {
            if (!this.healthStatuses.has(config.id)) {
                void this._probeHealth(config.id);
            }
        }
    }

    /**
     * Apply a basemap config to the maplibre map.
     * Removes previous basemap sources/layers, then adds the new ones.
     * On failure, logs the error and restores the previous basemap
     * best-effort — a first-ever failure leaves the map empty.
     */
    applyBasemap(basemap: BaseMapConfig): void {
        if (!basemap.style) {
            logger.warn(
                `BasemapStore.applyBasemap: "${basemap.id}" has no style, skipping`,
            );
            return;
        }

        const previous = this._lastApplied;
        const newOwnedIds = new Set<string>();
        try {
            this.rootStore.mapStore.removeOwnedLayers(this._ownedIds);
            this.rootStore.mapStore.applyStyleFragment(
                withSourceAttribution(basemap.style, basemap.attribution),
                BASEMAP_ID_PREFIX,
                newOwnedIds,
            );
            this._ownedIds = newOwnedIds;
            this._lastApplied = basemap;
        } catch (error) {
            logger.error(
                `BasemapStore.applyBasemap: failed to apply "${basemap.id}"`,
                error,
            );
            this._restoreApplied(previous, newOwnedIds);
        }
    }

    /**
     * Roll back to the last good basemap after a failed apply: drop whatever
     * partial fragment the failed call managed to add, then re-apply the
     * previous config. Both removal and re-apply are best-effort.
     */
    private _restoreApplied(
        previous: BaseMapConfig | undefined,
        partialIds: Set<string>,
    ): void {
        this.rootStore.mapStore.removeOwnedLayers(partialIds);
        this._ownedIds = new Set();
        if (!previous?.style) return;

        try {
            const restoredIds = new Set<string>();
            this.rootStore.mapStore.applyStyleFragment(
                withSourceAttribution(previous.style, previous.attribution),
                BASEMAP_ID_PREFIX,
                restoredIds,
            );
            this._ownedIds = restoredIds;
        } catch (error) {
            logger.error(
                `BasemapStore: restoring "${previous.id}" after a failed apply also failed`,
                error,
            );
        }
    }

    /**
     * Probe every config concurrently (one timeout window, statuses shared
     * with the panel), let the preference policy pick, apply the winner.
     * Sets the init-in-progress guard to prevent the sync reaction from
     * firing.
     */
    async findAndApplyInitialBasemap(): Promise<void> {
        this._initInProgress = true;

        try {
            const available = this.availableBasemaps;
            if (available.length === 0) return;

            const statuses = new Map<string, BasemapStatus>();
            await Promise.all(
                available.map(async (candidate) => {
                    statuses.set(
                        candidate.id,
                        await this._probeHealth(candidate.id),
                    );
                }),
            );

            const picked = pickInitialBasemap(
                this.activeBasemap,
                available,
                (id) => statuses.get(id),
            );
            if (!picked) return;

            if (picked.id !== this.activeBasemap?.id) {
                this.setActiveBasemap(picked.id);
            }
            this.applyBasemap(picked);
        } finally {
            runInAction(() => {
                this._initInProgress = false;
            });
        }
    }

    /** Start reactive sync: when the basemap setting changes, apply the new basemap. */
    startSync(): void {
        this.stopSync();

        this._syncDisposer = reaction(
            () =>
                this.rootStore.settingsStore.getStringSetting(
                    BASEMAP_SETTING_ID,
                ),
            () => {
                if (this._initInProgress) return;
                const basemap = this.activeBasemap;
                if (basemap) this.applyBasemap(basemap);
            },
            { name: "basemap-setting-sync" },
        );
    }

    /** Stop the reactive sync reaction. */
    stopSync(): void {
        this._syncDisposer?.();
        this._syncDisposer = null;
    }

    /** Clean up reaction, clear statuses, and clear owned layer tracking. */
    dispose(): void {
        this.stopSync();
        this.healthStatuses.clear();
        this._ownedIds.clear();
        this._lastApplied = undefined;
        this._configs = [];
    }

    /**
     * Probe one basemap and record the outcome. Unknown ids resolve to
     * "error" without touching the status map.
     */
    private async _probeHealth(
        basemapId: string,
        timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
    ): Promise<BasemapStatus> {
        const basemap = this._configs.find((bm) => bm.id === basemapId);
        if (!basemap) return "error";

        runInAction(() => this.healthStatuses.set(basemapId, "loading"));
        const healthy = await checkBasemapHealth(basemap, timeoutMs);
        const status: BasemapStatus = healthy ? "success" : "error";
        runInAction(() => this.healthStatuses.set(basemapId, status));
        return status;
    }

    /**
     * Sync the basemap select setting options from registered configs.
     * Updates options in place — no re-registration, no duplicate warning,
     * current value preserved.
     */
    private _syncSettingOptions(): void {
        const options = this._configs.map((bm) => ({
            label: bm.name,
            value: bm.id,
        }));

        this.rootStore.settingsStore.updateSettingOptions(
            BASEMAP_SETTING_ID,
            options,
        );
    }
}
