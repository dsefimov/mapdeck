/**
 * Typed config parsing for the shared render adapters. A protocol's
 * `RenderDescriptor.config` is `Record<string, unknown>` at the contract
 * level (the protocol is the sole authority on its shape, ADR-0009) — these
 * parsers are the single place where the shared adapters cross that boundary:
 * unknown keys are ignored, wrongly-typed values throw, type-correct but
 * out-of-range values are dropped.
 */

/** The slice of a raster protocol's config that {@link RasterAdapter} consumes. */
export interface RasterAdapterConfig {
    readonly opacity: number;
    readonly maxzoom?: number;
}

/** The slice of a vector protocol's config that {@link VectorAdapter} consumes. */
export interface VectorAdapterConfig {
    readonly layerType: "fill" | "line" | "circle" | "symbol";
    readonly paint: Record<string, unknown>;
    readonly opacity: number;
    readonly maxzoom?: number;
    readonly sourceLayer?: string;
}

/** The slice of a geojson protocol's config that {@link GeoJsonAdapter} consumes. */
export interface GeoJsonAdapterConfig {
    readonly layerType: "fill" | "line" | "circle";
    readonly paint: Record<string, unknown>;
    readonly opacity: number;
}

function asRecord(config: unknown): Record<string, unknown> {
    if (typeof config !== "object" || config === null) {
        throw new Error("Layer config must be an object.");
    }
    return config as Record<string, unknown>;
}

function readNumber(
    source: Record<string, unknown>,
    key: string,
    fallback: number,
): number {
    const value = source[key];
    if (value === undefined) return fallback;
    if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(`Layer config "${key}" must be a number.`);
    }
    return value;
}

function readPositiveNumber(
    source: Record<string, unknown>,
    key: string,
): number | undefined {
    const value = source[key];
    if (value === undefined) return undefined;
    if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(`Layer config "${key}" must be a number.`);
    }
    // A type-correct but non-positive value is dropped, not fatal.
    return value > 0 ? value : undefined;
}

const LAYER_TYPES = ["fill", "line", "circle", "symbol"] as const;

/** Reads a deck/maplibre geometry variant, throwing on anything unknown. */
function readLayerType(
    allowed: readonly string[],
    raw: unknown,
): string | undefined {
    if (raw === undefined) return undefined;
    if (typeof raw !== "string" || !allowed.includes(raw)) {
        throw new Error(
            `Layer config "layerType" must be one of: ${allowed.join(", ")}.`,
        );
    }
    return raw;
}

function readPaint(raw: unknown): Record<string, unknown> {
    if (raw === undefined) return {};
    if (typeof raw !== "object" || raw === null) {
        throw new Error('Layer config "paint" must be an object.');
    }
    return raw as Record<string, unknown>;
}

function readSourceLayer(raw: unknown): string | undefined {
    if (raw === undefined) return undefined;
    if (typeof raw !== "string" || raw === "") {
        throw new Error('Layer config "sourceLayer" must be a non-empty string.');
    }
    return raw;
}

/** Parses the raster adapter's config slice. */
export function parseRasterAdapterConfig(config: unknown): RasterAdapterConfig {
    const cfg = asRecord(config);
    const maxzoom = readPositiveNumber(cfg, "maxzoom");
    return {
        opacity: readNumber(cfg, "opacity", 1),
        ...(maxzoom !== undefined ? { maxzoom } : {}),
    };
}

/** Parses the vector adapter's config slice. */
export function parseVectorAdapterConfig(
    config: unknown,
): VectorAdapterConfig {
    const cfg = asRecord(config);
    const maxzoom = readPositiveNumber(cfg, "maxzoom");
    const sourceLayer = readSourceLayer(cfg.sourceLayer);
    return {
        layerType: (readLayerType(LAYER_TYPES, cfg.layerType) ?? "fill") as VectorAdapterConfig["layerType"],
        paint: readPaint(cfg.paint),
        opacity: readNumber(cfg, "opacity", 1),
        ...(maxzoom !== undefined ? { maxzoom } : {}),
        ...(sourceLayer !== undefined ? { sourceLayer } : {}),
    };
}

/** Parses the geojson adapter's config slice. */
export function parseGeoJsonAdapterConfig(
    config: unknown,
): GeoJsonAdapterConfig {
    const cfg = asRecord(config);
    return {
        layerType: (readLayerType(
            LAYER_TYPES.slice(0, 3),
            cfg.layerType,
        ) ?? "fill") as GeoJsonAdapterConfig["layerType"],
        paint: readPaint(cfg.paint),
        opacity: readNumber(cfg, "opacity", 1),
    };
}
