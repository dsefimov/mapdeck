import type { BaseMapConfig } from "@core/contracts";
import basemapConfigData from "./config.json";

/**
 * Parse raw basemap config entries into BaseMapConfig. The asset is
 * authored in-repo, so a malformed entry is a programming error and
 * fails loudly at startup — with the entry's id in the message, not as a
 * silent runtime break deep in the basemap UI.
 */
export function parseBasemapConfigs(raw: unknown): BaseMapConfig[] {
    if (!Array.isArray(raw)) {
        throw new Error("Basemap config must be an array");
    }
    return raw.map((entry, index) => parseEntry(entry, index));
}

/** The single validated entry point for the basemap config asset. */
export function loadBasemapConfigs(): BaseMapConfig[] {
    return parseBasemapConfigs(basemapConfigData);
}

function parseEntry(entry: unknown, index: number): BaseMapConfig {
    const label = describe(entry, index);
    if (!entry || typeof entry !== "object") {
        throw new Error(`Basemap config entry ${label} is not an object`);
    }
    const record = entry as Record<string, unknown>;

    requireString(record.id, "id", label);
    requireString(record.name, "name", label);
    if (
        record.attribution !== undefined &&
        typeof record.attribution !== "string"
    ) {
        throw new Error(`Basemap config entry ${label}: attribution must be a string`);
    }

    if (record.styleUrl !== undefined) {
        requireString(record.styleUrl, "styleUrl", label);
    } else if (!hasSources(record.style)) {
        throw new Error(
            `Basemap config entry ${label}: must carry an inline style with sources or a styleUrl`,
        );
    }

    return entry as BaseMapConfig;
}

function requireString(
    value: unknown,
    field: string,
    label: string,
): void {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(
            `Basemap config entry ${label}: "${field}" must be a non-empty string`,
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

function describe(entry: unknown, index: number): string {
    const id =
        entry && typeof entry === "object"
            ? (entry as Record<string, unknown>).id
            : undefined;
    return typeof id === "string" ? `"${id}"` : `#${index}`;
}
