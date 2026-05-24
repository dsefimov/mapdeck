/**
 * STAC Module implementation
 * Registers the STAC adapter with the SourceAdapterFactory.
 * Does not manage settings — the data source URL is configured
 * via the layer-tree widget settings.
 */

import { type Module } from "@core/framework/types";
import type { RootStore } from "@core/framework/store";
import { sourceAdapterFactory } from "@core/domain/adapters";
import { STACTreeAdapter } from "../adapter/STACTreeAdapter";
import { logger } from "@core/shared/diagnostics/logger";

export class STACModule implements Module {
    readonly id = "stac";
    readonly name = "STAC Catalog Module";

    private _rootStore: RootStore | null = null;

    setRootStore(rootStore: RootStore): void {
        this._rootStore = rootStore;
    }

    async register(): Promise<void> {
        logger.debug("Registering STAC adapter...");

        const adapter = new STACTreeAdapter();
        const factory =
            this._rootStore?.sourceAdapterFactory ?? sourceAdapterFactory;

        await factory.register("stac", adapter);

        logger.info("STAC adapter registered successfully");
    }
}

export const stacModule = new STACModule();
