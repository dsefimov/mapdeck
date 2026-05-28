/**
 * Registry for LayerConfig factories by role.
 *
 * Modules call `register()` to declare their default config; consumers
 * call `create()` to obtain a fresh config for a given role. The
 * registry is stored on RootStore so there is no module-level mutable state.
 */
import {
    type LayerConfig,
    LayerRoles,
    type LayerRole,
    ColorScheme,
} from "@core/framework/types";

type ConfigFactory = () => LayerConfig;

export class LayerConfigRegistry {
    private registry = new Map<LayerRole, ConfigFactory>();

    register(role: LayerRole, factory: ConfigFactory): void {
        this.registry.set(role, factory);
    }

    create(role: LayerRole): LayerConfig {
        const factory = this.registry.get(role);
        if (!factory) {
            throw new Error(`No default config registered for role: "${role}"`);
        }
        return factory();
    }
    registry.set(role, factory);
}

/**
 * Register the default config factories for all built-in roles.
 */
export function registerDefaultLayerConfigs(
    registry: LayerConfigRegistry,
): void {
    registry.register(LayerRoles.RASTER, () => ({
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
    }));

    registry.register(LayerRoles.VECTOR, () => ({
        role: LayerRoles.VECTOR,
        layerType: "fill",
        opacity: 1.0,
        visible: true,
        paint: {
            "fill-color": "#3f51b5",
            "fill-opacity": 0.7,
        },
    }));

    registry.register(LayerRoles.POINT_CLOUD, () => ({
        role: LayerRoles.POINT_CLOUD,
        opacity: 1.0,
        visible: true,
        pointSize: 1,
        colorScheme: ColorScheme.RGB,
        intensityMin: 0,
        intensityMax: 1,
        filterByClassification: false,
    }));

    registry.register(LayerRoles.VECTOR3D, () => ({
        role: LayerRoles.VECTOR3D,
        url: "",
        opacity: 1.0,
        visible: true,
        lineWidth: 2,
        lineColor: "#3f51b5",
    }));
}
