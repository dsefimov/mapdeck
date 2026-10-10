import type { StyleSpecification } from "maplibre-gl";

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
 * basemap tool's panel consumes. Registration (`registerConfigs`) stays on
 * the composition-root side.
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
