/**
 * STAC Module implementation
 * Registers the STAC adapter with the SourceAdapterFactory.
 * Does not manage settings — the data source URL is configured
 * via the layer-tree widget settings.
 */

import type { Module, ModuleContext } from "@core/contracts";
import { STACTreeAdapter } from "../adapter/STACTreeAdapter";
import { RoleResolverRegistry } from "../roles/RoleResolverRegistry";
import { ReportRoleResolver } from "../roles/resolvers/ReportRoleResolver";
import { AttributeRoleResolver } from "../roles/resolvers/AttributeRoleResolver";
import { RasterTileRoleResolver } from "../roles/resolvers/RasterTileRoleResolver";
import { WmsRoleResolver } from "../roles/resolvers/WmsRoleResolver";
import { VectorTileRoleResolver } from "../roles/resolvers/VectorTileRoleResolver";
import { GeoJsonRoleResolver } from "../roles/resolvers/GeoJsonRoleResolver";
import { PointCloudRoleResolver } from "../roles/resolvers/PointCloudRoleResolver";
import { logger } from "@core/lib/logger";

export class STACModule implements Module {
    readonly id = "stac";
    readonly name = "STAC Catalog Module";

    /**
     * Public resolver registry — other modules register their
     * STAC asset resolvers here to add support for new protocols.
     */
    readonly resolverRegistry = new RoleResolverRegistry();

    private resolversRegistered = false;

    async register(context: ModuleContext): Promise<void> {
        if (!this.resolversRegistered) {
            this.resolverRegistry.register(new ReportRoleResolver());
            this.resolverRegistry.register(new AttributeRoleResolver());
            this.resolverRegistry.register(new RasterTileRoleResolver());
            this.resolverRegistry.register(new WmsRoleResolver());
            this.resolverRegistry.register(new VectorTileRoleResolver());
            this.resolverRegistry.register(new GeoJsonRoleResolver());
            this.resolverRegistry.register(new PointCloudRoleResolver());
            this.resolversRegistered = true;
        }

        logger.debug("Registering STAC adapter...");

        const adapter = new STACTreeAdapter(
            this.resolverRegistry,
            context.layerTools,
        );
        context.sourceAdapterFactory.register(adapter);

        logger.debug("STAC adapter registered successfully");
    }
}

export const stacModule = new STACModule();
