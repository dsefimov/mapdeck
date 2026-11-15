/**
 * STAC Module implementation
 * Registers the STAC adapter with the SourceAdapterFactory and the STAC
 * role rules with the kernel asset mapper. Does not manage settings —
 * the data source URL is configured via the layer-tree widget settings.
 */

import type { Module, ModuleContext } from "@core/contracts";
import { STACTreeAdapter } from "../adapter/STACTreeAdapter";
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

    async register(context: ModuleContext): Promise<void> {
        // Rules go into the per-store mapper — a restart builds a fresh
        // store, so this registration is simply repeated.
        context.assetMapping.registerRule(new ReportRoleResolver());
        context.assetMapping.registerRule(new AttributeRoleResolver());
        context.assetMapping.registerRule(new RasterTileRoleResolver());
        context.assetMapping.registerRule(new WmsRoleResolver());
        context.assetMapping.registerRule(new VectorTileRoleResolver());
        context.assetMapping.registerRule(new GeoJsonRoleResolver());
        context.assetMapping.registerRule(new PointCloudRoleResolver());

        logger.debug("Registering STAC adapter...");

        const adapter = new STACTreeAdapter(
            context.assetMapping,
            context.layerTools,
        );
        context.sourceAdapterFactory.register(adapter);

        logger.debug("STAC adapter registered successfully");
    }
}

export const stacModule = new STACModule();
