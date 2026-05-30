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
import { getThemeValue } from "@core/shared/ui/themeColors";

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

    registry.register(LayerRoles.VECTOR, () => {
        const primary = getThemeValue("--color-primary", "#005a9b");
        return {
            role: LayerRoles.VECTOR,
            layerType: "fill",
            opacity: 1.0,
            visible: true,
            paint: {
                "fill-color": primary,
                "fill-opacity": 0.7,
                "fill-outline-color": primary,
                "line-color": primary,
                "line-width": 2,
                "line-opacity": 1.0,
                "circle-color": primary,
                "circle-radius": 5,
                "circle-opacity": 1.0,
                "circle-stroke-color": getThemeValue(
                    "--color-background",
                    "#ffffff",
                ),
                "circle-stroke-width": 1,
                "text-color": getThemeValue("--color-text", "#000000"),
            },
        };
    });

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

    registry.register(LayerRoles.GEOJSON, () => {
        const primary = getThemeValue("--color-primary", "#005a9b");
        return {
            role: LayerRoles.GEOJSON,
            layerType: "fill",
            opacity: 1.0,
            visible: true,
            paint: {
                "fill-color": primary,
                "fill-opacity": 0.7,
                "line-color": primary,
                "line-width": 2,
                "line-opacity": 1.0,
                "circle-color": primary,
                "circle-radius": 5,
                "circle-opacity": 1.0,
            },
        };
    });
}
