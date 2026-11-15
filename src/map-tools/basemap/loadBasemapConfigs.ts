import type { BaseMapConfig } from "@core/contracts";
import { validateBasemapConfig } from "@core/domain/map";
import basemapConfigData from "./config.json";

/**
 * Parse raw basemap config entries into BaseMapConfig. The asset is
 * authored in-repo, so a malformed entry is a programming error and
 * fails loudly at startup — with the entry's id in the message, not as a
 * silent runtime break deep in the basemap UI. Semantic rules (id, name,
 * style-or-styleUrl) live in the shared validator the registration port
 * applies to every config, built-in or module-registered.
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

    if (
        record.attribution !== undefined &&
        typeof record.attribution !== "string"
    ) {
        throw new Error(`Basemap config entry ${label}: attribution must be a string`);
    }
    if (record.styleUrl !== undefined) {
        requireString(record.styleUrl, "styleUrl", label);
    }

    validateBasemapConfig(entry as BaseMapConfig, `Basemap config entry ${label}`);
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

function describe(entry: unknown, index: number): string {
    const id =
        entry && typeof entry === "object"
            ? (entry as Record<string, unknown>).id
            : undefined;
    return typeof id === "string" ? `"${id}"` : `#${index}`;
}
