/**
 * Registry-based factory for creating default layer configurations by role.
 *
 * Instead of a switch on LayerRole (which doesn't work with branded strings
 * and requires core edits for new roles), modules register their config
 * factories via `registerDefaultConfig()`.
 */
import {
    type LayerConfig,
    type RasterLayerConfig,
    type VectorLayerConfig,
    type PointCloudLayerConfig,
    type Vector3DLayerConfig,
    LayerRoles,
    type LayerRole,
    ColorScheme,
} from "@core/framework/types";

type ConfigFactory = () => LayerConfig;
const registry = new Map<string, ConfigFactory>();

/**
 * Register a factory that produces a default LayerConfig for the given role.
 * Core calls this during bootstrap for built-in roles; modules call it in
 * their `Module.register()`.
 */
export function registerDefaultConfig(
    role: LayerRole,
    factory: ConfigFactory,
): void {
    if (registry.has(role)) {
        throw new Error(
            `Default config for role "${role}" is already registered`,
        );
    }
    registry.set(role, factory);
}

/**
 * Create a default LayerConfig for the specified role.
 *
 * @throws Error if no factory is registered for the role
 */
export function createDefaultConfig(role: LayerRole): LayerConfig {
    const factory = registry.get(role);
    if (!factory) {
        throw new Error(`No default config registered for role: "${role}"`);
    }
    return factory();
}

// ── Register built-in roles ─────────────────────────────────────────────

registerDefaultConfig(
    LayerRoles.RASTER,
    (): RasterLayerConfig => ({
        role: LayerRoles.RASTER,
        type: "xyz",
        url: "",
        opacity: 1.0,
        visible: true,
        paint: {
            "raster-opacity": 1.0,
            "raster-brightness-min": 0,
            "raster-brightness-max": 1,
            "raster-contrast": 0,
            "raster-saturation": 0,
            "raster-hue-rotate": 0,
            "raster-resampling": "linear",
        },
    }),
);

registerDefaultConfig(
    LayerRoles.VECTOR,
    (): VectorLayerConfig => ({
        role: LayerRoles.VECTOR,
        layerType: "fill",
        opacity: 1.0,
        visible: true,
        paint: {
            "fill-color": "#3f51b5",
            "fill-opacity": 0.7,
        },
    }),
);

registerDefaultConfig(
    LayerRoles.POINT_CLOUD,
    (): PointCloudLayerConfig => ({
        role: LayerRoles.POINT_CLOUD,
        opacity: 1.0,
        visible: true,
        pointSize: 1,
        colorScheme: ColorScheme.RGB,
        intensityMin: 0,
        intensityMax: 1,
        filterByClassification: false,
    }),
);

registerDefaultConfig(
    LayerRoles.VECTOR3D,
    (): Vector3DLayerConfig => ({
        role: LayerRoles.VECTOR3D,
        url: "",
        opacity: 1.0,
        visible: true,
        lineWidth: 2,
        lineColor: "#3f51b5",
    }),
);
