/**
 * STAC Module implementation
 * Registers the STAC adapter with the SourceAdapterFactory.
 * Does not manage settings — the data source URL is configured
 * via the layer-tree widget settings.
 */

import { type Module } from "@core/framework/types";
import type { RootStore } from "@core/framework/store";
import { STACTreeAdapter } from "../adapter/STACTreeAdapter";
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

        const adapter = new STACTreeAdapter(this.rootStore.layerConfigRegistry);
        await this.rootStore.sourceAdapterFactory.register("stac", adapter);

        logger.info("STAC adapter registered successfully");
    }
}

export const stacModule = new STACModule();
