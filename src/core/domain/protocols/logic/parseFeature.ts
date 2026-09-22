/**
 * Protocol-neutral normalized GeoJSON feature.
 */
export interface NormalizedFeature {
    /** Feature id as a string; empty when absent. */
    id: string;
    properties: Record<string, unknown>;
    geometry: Record<string, unknown> | null;
}

/**
 * Extract a single normalized GeoJSON feature from a raw object; null
 * when the value is not an object.
 */
export function parseFeature(feature: unknown): NormalizedFeature | null {
    if (!feature || typeof feature !== "object") return null;

    const f = feature as Record<string, unknown>;

    return {
        id: f.id !== undefined && f.id !== null ? String(f.id) : "",
        properties: parseProperties(f.properties),
        geometry: parseGeometry(f.geometry),
    };
}

function parseProperties(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
}

function parseGeometry(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null;
}
