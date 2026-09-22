import { logger } from "@core/lib/logger";

/**
 * Deployment configuration that changes per install, not per build: read
 * from `runtime-config.json` next to `index.html`, so a deployment retunes
 * asset paths and basemap tile servers without rebuilding the bundle.
 */

/** The shape of `runtime-config.json`. */
export interface RuntimeConfig {
    /**
     * Base for bundled binary assets, page-relative when empty. Deploying
     * under a sub-path or serving wasm from a sibling directory sets it
     * (e.g. "assets/" or "/portal/").
     */
    readonly assetsBase: string;
    /** Basemap id → tile URL templates replacing the baked raster tiles. */
    readonly basemapTileOverrides: Readonly<Record<string, readonly string[]>>;
}

const DEFAULT_CONFIG: RuntimeConfig = {
    assetsBase: "",
    basemapTileOverrides: {},
};

/**
 * Load the runtime config. A missing or malformed file is not an error —
 * the defaults describe the same-origin root deployment the bundle ships
 * with, and the log says which of the two happened.
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
    try {
        const response = await fetch("runtime-config.json");
        if (!response.ok) {
            logger.debug(
                `runtime-config.json: ${response.status} — using defaults`,
            );
            return DEFAULT_CONFIG;
        }
        return parseRuntimeConfig(await response.json());
    } catch {
        logger.debug("runtime-config.json: not readable — using defaults");
        return DEFAULT_CONFIG;
    }
}

/** Join an asset base with a file name, tolerating a missing trailing slash. */
export function joinAssetBase(base: string, name: string): string {
    if (base === "") return name;
    return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
}

/** Validate an unknown payload; unknown keys are ignored, bad ones fall back. */
export function parseRuntimeConfig(raw: unknown): RuntimeConfig {
    if (typeof raw !== "object" || raw === null) return DEFAULT_CONFIG;
    const record = raw as Record<string, unknown>;
    return {
        assetsBase:
            typeof record.assetsBase === "string" ? record.assetsBase : "",
        basemapTileOverrides: parseTileOverrides(
            record.basemapTileOverrides,
        ),
    };
}

function parseTileOverrides(raw: unknown): Record<string, readonly string[]> {
    if (typeof raw !== "object" || raw === null) return {};
    const result: Record<string, readonly string[]> = {};
    for (const [id, value] of Object.entries(
        raw as Record<string, unknown>,
    )) {
        if (
            Array.isArray(value) &&
            value.every((url) => typeof url === "string")
        ) {
            result[id] = value;
        }
    }
    return result;
}
