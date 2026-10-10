import type { Module } from "@core/contracts";
import type { RootStore } from "./rootStore";
import { registerProtocols } from "@core/domain/protocols/registerProtocols";
import { registerWidgets } from "@widgets/registerWidgets";
import { registerTools } from "@layer-tools/registerTools";
import { registerMapTools } from "@map-tools/registerMapTools";
import { registerBasemaps } from "@map-tools/registerBasemaps";
import { registerModules } from "@modules/registerModules";
import { assertKnownProtocols } from "@core/domain/layer-tree";
import { logger } from "@core/lib/logger";

/**
 * Everything bootstrap consumes — supplied by the assembly: the demo's
 * `main.tsx` (appConfig + runtime-config.json) or the embed facade
 * (`createMapdeck` options). No IO happens here.
 */
export interface BootstrapOptions {
    /** Source type served when none is named — must match a registered source adapter. */
    readonly defaultSourceType: string;
    /**
     * Whether the built-in basemap set registers. `false` is the assembly
     * saying the box ships without built-in basemaps — a module (or nothing)
     * provides them instead.
     */
    readonly builtinBasemaps?: boolean;
    /** Where the LazPerf decoder binary lives — point-cloud (COPC) only. */
    readonly lazPerfWasmUrl?: string;
    /** Modules in execution order: built-ins first, the consumer's after. */
    readonly modules: readonly Module[];
}

/**
 * Application bootstrap: registers extensions explicitly, then initializes
 * the root store. A registration failure is surfaced via RootStore.initError
 * so the UI can render the error screen; retry re-runs this whole bootstrap
 * against a fresh store.
 */
export async function bootstrap(
    rootStore: RootStore,
    options: BootstrapOptions,
): Promise<void> {
    try {
        // Fixed assembly order, one concern per step: built-ins
        // first, modules last — they may register extensions of any kind and
        // need the built-in registries populated — and the tree fetch in
        // initialize() closes the sequence: it depends on source adapters
        // registered by the modules.
        await registerWidgets(rootStore);
        await registerTools(rootStore);
        registerMapTools(rootStore);
        if (options.builtinBasemaps !== false) {
            await registerBasemaps(rootStore);
        }
        registerProtocols(
            rootStore,
            options.lazPerfWasmUrl
                ? { lazPerfWasmUrl: options.lazPerfWasmUrl }
                : {},
        );
        await registerModules(rootStore.moduleContext, options.modules);
        finalizeBasemaps(rootStore);
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
    await rootStore.initialize(options.defaultSourceType);
}

/**
 * Close the basemap channel once every registration ran: settle the select
 * setting's options (a no-op for an empty registry — there is nothing to
 * point at) and say so — an assembly without a single basemap renders a
 * baseless map.
 */
function finalizeBasemaps(rootStore: RootStore): void {
    rootStore.basemapStore.syncSettingOptions();
    if (rootStore.basemapStore.availableBasemaps.length === 0) {
        logger.warn(
            "No basemaps registered — the map will render without a base layer",
        );
    }
}
