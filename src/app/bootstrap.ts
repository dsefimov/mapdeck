import type { RootStore } from "./rootStore";
import { registerProtocols } from "@core/domain/protocols/registerProtocols";
import { registerWidgets } from "@widgets/registerWidgets";
import { registerTools } from "@layer-tools/registerTools";
import { registerMapTools } from "@map-tools/registerMapTools";
import { registerBasemaps } from "@map-tools/registerBasemaps";
import { registerModules } from "@modules/registerModules";
import { assertKnownProtocols } from "@core/domain/layer-tree";
import { joinAssetBase, loadRuntimeConfig } from "./runtimeConfig";

/**
 * Application bootstrap: reads the deployment's runtime config, registers
 * extensions explicitly, then initializes the root store. A registration
 * failure is surfaced via RootStore.initError so the UI can render the
 * error screen; retry re-runs this whole bootstrap against a fresh store.
 */
export async function bootstrap(rootStore: RootStore): Promise<void> {
    try {
        // Fixed assembly order, one concern per step (ADR-0005): built-ins
        // first, modules last — they may register extensions of any kind and
        // need the built-in registries populated — and the tree fetch in
        // initialize() closes the sequence: it depends on source adapters
        // registered by the modules.
        const runtime = await loadRuntimeConfig();
        await registerWidgets(rootStore);
        await registerTools(rootStore);
        registerMapTools(rootStore);
        await registerBasemaps(rootStore, runtime.basemapTileOverrides);
        registerProtocols(rootStore, {
            lazPerfWasmUrl: joinAssetBase(runtime.assetsBase, "laz-perf.wasm"),
        });
        await registerModules(rootStore.moduleContext);
        assertKnownProtocols(
            rootStore.layerToolStore.boundProtocolIds,
            new Set(
                rootStore.protocolRegistry
                    .getAll()
                    .map((protocol) => protocol.id),
            ),
        );
    } catch (error) {
        rootStore.setInitError(error);
        return;
    }
    await rootStore.initialize();
}
