import type { BaseMapConfig } from "@core/contracts";

/**
 * Entry validation of a basemap config, shared by the store's registration
 * port and the asset parser: a config must carry a non-empty id and name,
 * and either an inline style with sources or a styleUrl to fetch one from.
 * A malformed entry is a programming error that fails loudly at
 * registration, not a silent "unavailable" card deep in the basemap panel.
 */
export function validateBasemapConfig(
    config: BaseMapConfig,
    label: string,
): void {
    if (typeof config.id !== "string" || !config.id.trim()) {
        throw new Error(`${label}: "id" must be a non-empty string`);
    }
    if (typeof config.name !== "string" || !config.name.trim()) {
        throw new Error(`${label}: "name" must be a non-empty string`);
    }
    if (config.styleUrl === undefined && !hasSources(config.style)) {
        throw new Error(
            `${label}: must carry an inline style with sources or a styleUrl`,
        );
    }
}

/** An inline style is load-bearing only through its sources (rendering
 * and the health probe both read them) — deeper StyleSpecification
 * internals stay maplibre's to validate. */
function hasSources(style: unknown): boolean {
    if (!style || typeof style !== "object") return false;
    const sources = (style as Record<string, unknown>).sources;
    if (!sources || typeof sources !== "object") return false;
    return Object.keys(sources).length > 0;
}
