/**
 * STAC Module implementation
 * Registers the STAC adapter with the SourceAdapterFactory.
 * Does not manage settings — the data source URL is configured
 * via the layer-tree widget settings.
 */

import { type Module } from "@core/framework/types";
import type { RootStore } from "@core/framework/store";
import { STACTreeAdapter } from "../adapter/STACTreeAdapter";
import { RoleResolverRegistry } from "../roles/RoleResolverRegistry";
import { ReportRoleResolver } from "../roles/resolvers/ReportRoleResolver";
import { AttributeRoleResolver } from "../roles/resolvers/AttributeRoleResolver";
import { RasterTileRoleResolver } from "../roles/resolvers/RasterTileRoleResolver";
import { WmsRoleResolver } from "../roles/resolvers/WmsRoleResolver";
import { VectorTileRoleResolver } from "../roles/resolvers/VectorTileRoleResolver";
import { GeoJsonRoleResolver } from "../roles/resolvers/GeoJsonRoleResolver";
import { PointCloudRoleResolver } from "../roles/resolvers/PointCloudRoleResolver";
import { logger } from "@core/shared/diagnostics/logger";

export class STACModule implements Module {
    readonly id = "stac";
    readonly name = "STAC Catalog Module";

    private rootStore: RootStore | null = null;

    setRootStore(rootStore: RootStore): void {
        this.rootStore = rootStore;
    }

    async register(): Promise<void> {
        if (!this.rootStore) {
            throw new Error(
                "STACModule requires rootStore — call setRootStore before register()",
            );
        }

        logger.debug("Registering STAC adapter...");

        const roleRegistry = createDefaultRoleRegistry();
        const adapter = new STACTreeAdapter(
            this.rootStore.layerConfigRegistry,
            roleRegistry,
        );
        await this.rootStore.sourceAdapterFactory.register("stac", adapter);

        logger.debug("STAC adapter registered successfully");
    }
}

function createDefaultRoleRegistry(): RoleResolverRegistry {
    const registry = new RoleResolverRegistry();
    registry.register(new ReportRoleResolver());
    registry.register(new AttributeRoleResolver());
    registry.register(new RasterTileRoleResolver());
    registry.register(new WmsRoleResolver());
    registry.register(new VectorTileRoleResolver());
    registry.register(new GeoJsonRoleResolver());
    registry.register(new PointCloudRoleResolver());
    // Not yet implemented: TiledAssetsRoleResolver — tracked in PLAN.md
    return registry;
}

export const stacModule = new STACModule();
