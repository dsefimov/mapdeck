/**
 * Layer configuration for rendering based on layer role.
 * Contains styling and visualization parameters separate from data source.
 */
import { LayerRoles, type LayerRole } from "./role";
import { ColorScheme } from "../../data/pointCloud";

// Base interface for all layer configurations
export interface LayerConfigBase {
    /**
     * The layer role discriminator.
     * Built-in configs narrow this to a literal (e.g. `"raster"`);
     * modules provide their own config via this base type.
     */
    role: LayerRole;

    /**
     * Layer opacity (0.0 to 1.0)
     * @default 1.0
     */
    opacity?: number;

    /**
     * Whether the layer is visible
     * @default true
     */
    visible?: boolean;
}

/**
 * Raster layer configuration
 */
export interface RasterLayerConfig extends LayerConfigBase {
    role: typeof LayerRoles.RASTER;

    /**
     * Raster source type
     */
    type: "xyz" | "wms" | "cog";

    /**
     * Tile URL template (xyz) or WMS/COG endpoint URL
     */
    url: string;

    /**
     * WMS layer name (only for type: "wms")
     */
    layers?: string;

    /**
     * WMS version (only for type: "wms")
     * @default "1.3.0"
     */
    version?: string;

    /**
     * Paint properties for raster layers
     */
    paint?: {
        /**
         * Raster opacity (0.0 to 1.0)
         * @default 1.0
         */
        "raster-opacity"?: number;

        /**
         * Raster brightness (0.0 to 1.0)
         * @default 0
         */
        "raster-brightness-min"?: number;

        /**
         * Maximum raster brightness (0.0 to 1.0)
         * @default 1
         */
        "raster-brightness-max"?: number;

        /**
         * Raster contrast (-1.0 to 1.0)
         * @default 0
         */
        "raster-contrast"?: number;

        /**
         * Raster saturation (0.0 to 1.0)
         * @default 0
         */
        "raster-saturation"?: number;

        /**
         * Raster hue rotation in degrees
         * @default 0
         */
        "raster-hue-rotate"?: number;

        /**
         * Raster resampling method
         * @default 'linear'
         */
        "raster-resampling"?: "linear" | "nearest";
    };
}

/**
 * Vector layer configuration
 */
export interface VectorLayerConfig extends LayerConfigBase {
    role: typeof LayerRoles.VECTOR;

    /**
     * Type of vector layer (fill, line, circle, symbol)
     */
    layerType: "fill" | "line" | "circle" | "symbol";

    /**
     * Paint properties specific to the layer type
     */
    paint?: {
        // Common properties
        opacity?: number;

        // Fill-specific
        "fill-color"?: string;
        "fill-opacity"?: number;
        "fill-outline-color"?: string;
        "fill-pattern"?: string;

        // Line-specific
        "line-color"?: string;
        "line-width"?: number;
        "line-opacity"?: number;
        "line-dasharray"?: number[];

        // Circle-specific
        "circle-color"?: string;
        "circle-radius"?: number;
        "circle-opacity"?: number;
        "circle-stroke-color"?: string;
        "circle-stroke-width"?: number;

        // Symbol-specific
        "text-color"?: string;
        "text-halo-color"?: string;
        "text-halo-width"?: number;
        "icon-color"?: string;
        "icon-size"?: number;
    };

    /**
     * Layout properties
     */
    layout?: {
        visibility?: "visible" | "none";
        "line-cap"?: "butt" | "round" | "square";
        "line-join"?: "bevel" | "round" | "miter";
    };
}

/**
 * Point cloud layer configuration
 */
export interface PointCloudLayerConfig extends LayerConfigBase {
    role: typeof LayerRoles.POINT_CLOUD;

    /**
     * Point size in pixels
     * @default 1
     */
    pointSize?: number;

    /**
     * Color scheme for point cloud visualization
     * @default ColorScheme.RGB
     */
    colorScheme?: ColorScheme;

    /**
     * Bounding box in WGS84 degrees (EPSG:4326) [minLng, minLat, minZ, maxLng, maxLat, maxZ]
     * Used for coordinate origin calculation and chunk bounds
     */
    bounds?: [number, number, number, number, number, number];

    /**
     * Coordinate origin in WGS84 degrees (EPSG:4326) [lng, lat, 0]
     * Required for LNGLAT_OFFSETS coordinate system in deck.gl
     */
    coordinateOrigin?: [number, number, number];

    /**
     * Minimum intensity for color mapping (0-1)
     */
    intensityMin?: number;

    /**
     * Maximum intensity for color mapping (0-1)
     */
    intensityMax?: number;

    /**
     * Filter by classification codes
     */
    classificationFilter?: number[];

    /**
     * Whether to show only selected classifications
     * @default false
     */
    filterByClassification?: boolean;
}

/**
 * GeoJSON layer configuration.
 * Renders GeoJSON FeatureCollection data as fill/line/circle/symbol.
 */
export interface GeoJsonLayerConfig extends LayerConfigBase {
    role: typeof LayerRoles.GEOJSON;

    /**
     * Type of GeoJSON layer (fill, line, circle, symbol)
     * @default "fill"
     */
    layerType: "fill" | "line" | "circle" | "symbol";

    /** Paint style overrides for the rendered features. */
    paint?: {
        "fill-color"?: string;
        "fill-opacity"?: number;
        "line-color"?: string;
        "line-width"?: number;
        "line-opacity"?: number;
        "circle-color"?: string;
        "circle-radius"?: number;
        "circle-opacity"?: number;
    };
}

/**
 * Union type for all layer configurations discriminated by role.
 */
export type LayerConfig =
    | RasterLayerConfig
    | VectorLayerConfig
    | PointCloudLayerConfig
    | GeoJsonLayerConfig;

/**
 * Open registry: role string → config type.
 * Core defines built-in entries. Modules augment via declaration merging
 */
export interface LayerConfigRegistry {
    [LayerRoles.RASTER]: RasterLayerConfig;
    [LayerRoles.VECTOR]: VectorLayerConfig;
    [LayerRoles.POINT_CLOUD]: PointCloudLayerConfig;
    [LayerRoles.GEOJSON]: GeoJsonLayerConfig;
}

/**
 * Map a role string to its corresponding config type via LayerConfigRegistry.
 *
 * ```ts
 * LayerConfigFor<typeof LayerRoles.RASTER>  // → RasterLayerConfig
 * LayerConfigFor<LayerRole>                 // → LayerConfigBase (fallback)
 * ```
 */
export type LayerConfigFor<R extends LayerRole> =
    R extends keyof LayerConfigRegistry
        ? LayerConfigRegistry[R]
        : LayerConfigBase;

/**
 * Partial config update payload — excludes the immutable role discriminator
 */
export type LayerConfigUpdates<T extends LayerConfig> = Partial<
    Omit<T, "role">
>;

/**
 * Type guard to check if a config is for a specific role
 */
export function isRasterConfig(
    config: LayerConfig,
): config is RasterLayerConfig {
    return config.role === LayerRoles.RASTER;
}

export function isVectorConfig(
    config: LayerConfig,
): config is VectorLayerConfig {
    return config.role === LayerRoles.VECTOR;
}

export function isPointCloudConfig(
    config: LayerConfig,
): config is PointCloudLayerConfig {
    return config.role === LayerRoles.POINT_CLOUD;
}

export function isGeoJsonConfig(
    config: LayerConfig,
): config is GeoJsonLayerConfig {
    return config.role === LayerRoles.GEOJSON;
}
