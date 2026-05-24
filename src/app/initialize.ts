import { logger } from "@core/shared/diagnostics/logger";
import { registerBuiltInWidgets } from "@widgets/registerWidgets";
import {
    registerLayerAdapters,
    registerAttributeAdapters,
} from "@core/domain/adapters";
import { registerModules } from "@modules/registerModules";
import { registerTools } from "@layer-tools/registerTools";
import { registerMapTools } from "@map-tools/registerMapTools";
import type { RootStore } from "@core/framework/store";

export async function initializeApp(rootStore: RootStore): Promise<void> {
    rootStore.clearInitError();

    try {
        await registerLayerAdapters(rootStore);
        await registerAttributeAdapters(rootStore);
        await registerBuiltInWidgets(rootStore);
        await registerTools(rootStore);
        await registerMapTools(rootStore);
        await registerModules(rootStore);

        await rootStore.treeStore.fetchLayerTree();

        rootStore.markInitialized();
    } catch (error) {
        logger.error("Failed to initialize app:", error);
        rootStore.setInitError(error);
    }
}
