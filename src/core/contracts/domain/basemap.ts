import type { StyleSpecification } from "maplibre-gl";
import type { RegisterOptions } from "@core/lib/registry";

/** Health status of a basemap source. */
export type BasemapStatus = "loading" | "success" | "error";

/** Static configuration of one registered basemap. */
export interface BaseMapConfig {
    id: string;
    name: string;
    /** Maplibre style fragment with sources and layers. */
    style?: StyleSpecification;
    /**
     * URL to an external maplibre style JSON file.
     * When set, the style is fetched from this URL instead of using the inline `style`.
     */
    styleUrl?: string;
    /** Path to a static preview image, relative to the config file location. */
    previewImage?: string;
    /** Optional attribution override; sources may also carry their own attribution. */
    attribution?: string;
}

/**
 * Runtime-slice port over the basemap subsystem: the surface the
 * basemap tool's panel consumes.
 */
export interface BasemapPort {
    /** All registered basemap configs (no filtering). */
    readonly availableBasemaps: readonly BaseMapConfig[];
    /** The currently active basemap, if one is set. */
    readonly activeBasemap: BaseMapConfig | undefined;
    /** Health status per basemap id. */
    readonly healthStatuses: ReadonlyMap<string, BasemapStatus>;
    /** Probe every registered basemap without a recorded status yet. */
    refreshHealthStatuses(): Promise<void> | void;
    /** Switch the active basemap. */
    setActiveBasemap(id: string): void;
}

/**
 * Registration view over the basemap subsystem — the port through which
 * the composition root registers the built-in set and modules register
 * their own basemaps (replacing built-ins by id with `override`).
 * Configs carrying a `styleUrl` get their style fetched during
 * registration; a failed fetch keeps the config registered and the health
 * probe reports it unavailable.
 */
export interface BasemapRegistrationPort extends BasemapPort {
    /**
     * Register basemaps under their ids. Duplicate ids throw unless
     * `opts.override` — the explicit replacement semantics.
     */
    registerConfigs(
        configs: readonly BaseMapConfig[],
        opts?: RegisterOptions,
    ): Promise<void>;
}
