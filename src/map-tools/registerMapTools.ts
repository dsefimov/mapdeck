import type { RootStore } from "@core/framework/store";
import { Ruler3DTool } from "./ruler-3d";
import { AreaMeasureTool } from "./area-measure";
import { VolumeMeasureTool } from "./volume-measure";
import { BasemapTool } from "./basemap";
import { ResetOrientationTool } from "./reset-orientation";
import { FeatureInfoTool } from "./feature-info";
import { OverlayFeatureProvider } from "./feature-info/providers/OverlayFeatureProvider";
import { VectorFeatureProvider } from "./feature-info/providers/VectorFeatureProvider";
import { WmsFeatureProvider } from "./feature-info/providers/WmsFeatureProvider";
import { featureProviderRegistry } from "./feature-info/providers/FeatureProvider";
import basemapConfigData from "./basemap/config.json";
import type { BaseMapSettings } from "@core/framework/types";

/**
 * All built-in map tools.
 * Add new tools here by importing and instantiating them.
 */
const BUILT_IN_TOOLS = [
    new ResetOrientationTool(),
    new Ruler3DTool(),
    new AreaMeasureTool(),
    new VolumeMeasureTool(),
    new BasemapTool(),
    new FeatureInfoTool(),
];

/**
 * Register all built-in map tools and feature providers
 * @param rootStore - Root store instance
 */
export async function registerMapTools(rootStore: RootStore): Promise<void> {
    featureProviderRegistry.register(
        "overlay",
        new OverlayFeatureProvider(
            rootStore.mapStore,
            rootStore.layerAdapterFactory,
        ),
    );
    featureProviderRegistry.register("vector", new VectorFeatureProvider());
    featureProviderRegistry.register("wms", new WmsFeatureProvider());

    const basemapSettings = basemapConfigData as BaseMapSettings;
    rootStore.mapStore.registerBasemapConfigs(
        basemapSettings.available_basemaps,
    );

    for (const tool of BUILT_IN_TOOLS) {
        rootStore.localeStore.registerTranslations(
            tool.id,
            tool.localeTranslations,
        );
        rootStore.mapToolStore.registerTool(tool);
    }
}
