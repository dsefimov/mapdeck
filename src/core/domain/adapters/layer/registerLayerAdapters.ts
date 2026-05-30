import {
    type LayerAdapter,
    LayerRoles,
    type LayerRole,
} from "@core/framework/types";
import type { RootStore } from "@core/framework/store";
import { logger } from "@core/shared/diagnostics/logger";
import { registerDefaultLayerConfigs } from "./createDefaultLayerConfig";
import { RasterAdapter } from "./impl/RasterAdapter";
import { VectorAdapter } from "./impl/VectorAdapter";
import { PointCloudAdapter } from "./impl/PointCloudAdapter";
import { GeoJsonAdapter } from "./impl/GeoJsonAdapter";

const ADAPTERS: [LayerRole, LayerAdapter][] = [
    [LayerRoles.RASTER, new RasterAdapter()],
    [LayerRoles.VECTOR, new VectorAdapter()],
    [LayerRoles.POINT_CLOUD, new PointCloudAdapter()],
    [LayerRoles.GEOJSON, new GeoJsonAdapter()],
];

export async function registerLayerAdapters(
    rootStore: RootStore,
): Promise<void> {
    try {
        registerDefaultLayerConfigs(rootStore.layerConfigRegistry);

        for (const [role, adapter] of ADAPTERS) {
            await rootStore.layerAdapterFactory.register(role, adapter);
        }
    } catch (error) {
        logger.error("Failed to register layer adapters:", error);
        throw error;
    }
}
