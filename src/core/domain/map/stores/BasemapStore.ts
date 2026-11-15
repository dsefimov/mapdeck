import {
    makeAutoObservable,
    observable,
    reaction,
    runInAction,
    type IReactionDisposer,
} from "mobx";
import type maplibregl from "maplibre-gl";
import type { RegisterOptions } from "@core/lib/registry";
import { applyRegistration } from "@core/lib/registry";
import type { StoreRegistry } from "@core/store-registry";
import type {
    BaseMapConfig,
    BasemapRegistrationPort,
    BasemapStatus,
} from "@core/contracts";
import {
    checkBasemapHealth,
    DEFAULT_PROBE_TIMEOUT_MS,
} from "../basemap/checkBasemapHealth";
import { fetchBasemapStyle } from "../basemap/fetchBasemapStyle";
import { validateBasemapConfig } from "../basemap/validateBasemapConfig";
import { pickInitialBasemap } from "../logic/pickInitialBasemap";
import { repairBasemapSetting } from "../logic/repairBasemapSetting";
import { withSourceAttribution } from "../logic/withSourceAttribution";
import { logger } from "@core/lib/logger";

/** Single owner of the basemap setting key — tools import it, never re-declare. */
export const BASEMAP_SETTING_ID = "basemap.basemap";
const BASEMAP_ID_PREFIX = "basemap_";

export class BasemapStore implements BasemapRegistrationPort {
    /**
     * id → config, insertion-ordered: an override replaces in place (the
     * entry keeps its position), and the observable map keeps late
     * registrations visible to the panel.
     */
    private readonly _configs = observable.map<string, BaseMapConfig>();
    /** Last known health per basemap id — sticky for the session. */
    readonly healthStatuses = observable.map<string, BasemapStatus>();
    private _ownedIds: Set<string> = new Set();
    /** Last successfully applied config — the rollback target of a failed switch. */
    private _lastApplied: BaseMapConfig | undefined;
    /**
     * The map instance the current style was applied to — the map-attach
     * sync compares identities, so a remount re-applies on the new map.
     * A ref: the maplibre instance is external state, only identity is
     * observable.
     */
    private _lastAppliedMap: maplibregl.Map | undefined;
    private _syncDisposer: IReactionDisposer | null = null;
    private _mapSyncDisposer: IReactionDisposer | null = null;
    private _activeBasemapSyncDisposer: IReactionDisposer | null = null;
    private _initInProgress = false;
    /** Default the setting was last synced to — the repair's own memory. */
    private _lastSyncedDefault: string | undefined;

    constructor(readonly rootStore: StoreRegistry) {
        makeAutoObservable<
            this,
            "healthStatuses" | "_configs" | "_lastAppliedMap"
        >(
            this,
            {
                rootStore: false,
                healthStatuses: false,
                _configs: false,
                _lastAppliedMap: observable.ref,
            },
        );
    }

    /**
     * Register basemap configs — the single registration path for the
     * built-in set and modules. Validates every config, fetches the style
     * of `styleUrl` configs that carry no inline `style` (the inline style
     * wins; a failed fetch keeps the config registered and the health
     * probe reports it unavailable), then applies everything in one
     * synchronous all-or-nothing section: a duplicate id — within the
     * batch, or against the registry without `opts.override` — throws
     * before anything is applied; with `override` an entry replaces in
     * place, drops its stale health status, and re-applies the active
     * basemap when its config was the one replaced. The basemap setting's
     * options and a dangling value/default are repaired in the same
     * section.
     */
    async registerConfigs(
        configs: readonly BaseMapConfig[],
        opts?: RegisterOptions,
    ): Promise<void> {
        const batchIds = new Set<string>();
        for (const config of configs) {
            validateBasemapConfig(config, `Basemap config "${config.id}"`);
            if (batchIds.has(config.id)) {
                throw new Error(
                    `Basemap config "${config.id}" appears twice in one registration.`,
                );
            }
            batchIds.add(config.id);
        }

        const resolved = await Promise.all(
            configs.map(async (config) => ({
                config,
                style:
                    config.styleUrl && !config.style
                        ? await fetchBasemapStyle(config.styleUrl)
                        : undefined,
            })),
        );

        const replacedActiveIds = new Set<string>();
        runInAction(() => {
            // The batch is checked against the registry before anything is
            // applied — a colliding id must not leave a partial registration.
            const collision = resolved.find(
                ({ config }) =>
                    this._configs.has(config.id) && !opts?.override,
            );
            if (collision) {
                throw new Error(
                    `Basemap "${collision.config.id}" is already registered.`,
                );
            }
            for (const { config, style } of resolved) {
                const entry =
                    style === undefined ? config : { ...config, style };
                const existed = this._configs.has(entry.id);
                applyRegistration(this._configs, {
                    label: "Basemap",
                    key: entry.id,
                    item: entry,
                    opts,
                });
                if (existed) {
                    this.healthStatuses.delete(entry.id);
                    replacedActiveIds.add(entry.id);
                }
            }
            const active = this.activeBasemap;
            if (
                active &&
                replacedActiveIds.has(active.id) &&
                this._lastApplied
            ) {
                this.applyBasemap(active);
            }
            this.syncSettingOptions();
        });
    }

    /** All registered basemap configs (no filtering). */
    get availableBasemaps(): BaseMapConfig[] {
        return Array.from(this._configs.values());
    }

    /** Currently active basemap config, resolved from the setting. */
    get activeBasemap(): BaseMapConfig | undefined {
        const id =
            this.rootStore.settingsStore.getStringSetting(BASEMAP_SETTING_ID);
        if (!id) return undefined;
        return this._configs.get(id);
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
        for (const config of this._configs.values()) {
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

        // applyStyleFragment drops fragments while no map is attached —
        // applying now would silently lose the style while the bookkeeping
        // still records a success. Defer to the map-attach sync instead.
        const map = this.rootStore.mapStore.getMap();
        if (!map) {
            logger.warn(
                `BasemapStore.applyBasemap: no map attached yet, "${basemap.id}" waits for the map-attach sync`,
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
            this._lastAppliedMap = map;
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

    /**
     * Start reactive sync: when the basemap setting changes, apply the new
     * basemap; when a map attaches (first attach or remount) or the active
     * basemap appears while a bare map is attached, catch the style up via
     * `_applyActiveToAttachedMap`.
     */
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

        this._mapSyncDisposer = reaction(
            () => this.rootStore.mapStore.getMap(),
            () => this._applyActiveToAttachedMap(),
            { name: "basemap-map-attach-sync", fireImmediately: true },
        );

        this._activeBasemapSyncDisposer = reaction(
            () => this.activeBasemap?.id ?? null,
            () => this._applyActiveToAttachedMap(),
            { name: "basemap-availability-sync", fireImmediately: true },
        );
    }

    /**
     * Catch-up apply: when an unstyled map is attached and the active
     * basemap is resolved, put the style on it. Both init orderings lose
     * races — the initial apply can run before the map mounts
     * (applyStyleFragment drops the fragment) and before the async config
     * registration lands (nothing to apply) — the map-attach and
     * availability reactions both land here.
     */
    private _applyActiveToAttachedMap(): void {
        if (this._initInProgress) return;
        const map = this.rootStore.mapStore.getMap();
        if (!map || this._lastAppliedMap === map) return;
        const basemap = this.activeBasemap;
        if (basemap) this.applyBasemap(basemap);
    }

    /** Stop the reactive sync reactions. */
    stopSync(): void {
        this._syncDisposer?.();
        this._syncDisposer = null;
        this._mapSyncDisposer?.();
        this._mapSyncDisposer = null;
        this._activeBasemapSyncDisposer?.();
        this._activeBasemapSyncDisposer = null;
    }

    /** Clean up reaction, clear statuses, and clear owned layer tracking. */
    dispose(): void {
        this.stopSync();
        this.healthStatuses.clear();
        this._ownedIds.clear();
        this._lastApplied = undefined;
        this._lastAppliedMap = undefined;
        this._lastSyncedDefault = undefined;
        this._configs.clear();
    }

    /**
     * Probe one basemap and record the outcome. Unknown ids resolve to
     * "error" without touching the status map.
     */
    private async _probeHealth(
        basemapId: string,
        timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
    ): Promise<BasemapStatus> {
        const basemap = this._configs.get(basemapId);
        if (!basemap) return "error";

        runInAction(() => this.healthStatuses.set(basemapId, "loading"));
        const healthy = await checkBasemapHealth(basemap, timeoutMs);
        const status: BasemapStatus = healthy ? "success" : "error";
        runInAction(() => this.healthStatuses.set(basemapId, status));
        return status;
    }

    /**
     * Sync the basemap select setting with the registered configs: rebuild
     * the options and repair a value/default that no longer names a
     * registered basemap. Called after every registration and once more at
     * the end of assembly, so an empty custom assembly leaves the setting
     * consistent too.
     */
    syncSettingOptions(): void {
        const repair = repairBasemapSetting(this.availableBasemaps, {
            value: this.rootStore.settingsStore.getStringSetting(
                BASEMAP_SETTING_ID,
            ),
            defaultValue: this._lastSyncedDefault,
        });
        if (repair.options.length === 0) return;

        this.rootStore.settingsStore.updateSettingOptions(
            BASEMAP_SETTING_ID,
            repair.options,
            repair.defaultValue,
        );
        if (repair.defaultValue !== undefined) {
            this._lastSyncedDefault = repair.defaultValue;
        }
        if (repair.value !== undefined) {
            this.rootStore.settingsStore.setSetting(
                BASEMAP_SETTING_ID,
                repair.value,
            );
        }
    }
}
