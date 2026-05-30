import { logger } from "@core/shared/diagnostics/logger";
import { stacModule } from "./stac";
import type { RootStore } from "@core/framework/store";
import type { Module } from "@core/framework/types";

export async function registerModules(rootStore: RootStore): Promise<void> {
    try {
        logger.debug("Starting module registration...");

        const modules: Module<Record<string, unknown>>[] = [
            stacModule,
            // Add future modules here
        ];

        for (const module of modules) {
            logger.debug(
                `Registering module "${module.id}" (${module.name})...`,
            );

            if (module.setRootStore) {
                module.setRootStore(rootStore);
                logger.debug(`RootStore provided to module "${module.id}"`);
            }

            await module.register();

            logger.debug(`Module "${module.id}" registered successfully`);
        }

        logger.info(`All modules registered (${modules.length} total)`);
    } catch (error) {
        logger.error("Failed to register modules:", error);
        throw error;
    }
}

export default registerModules;
