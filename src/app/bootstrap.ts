import type { Module } from "@core/contracts";
import type { RootStore } from "./rootStore";
import { registerProtocols } from "@core/domain/protocols/registerProtocols";
import { registerWidgets } from "@widgets/registerWidgets";
import { registerTools } from "@layer-tools/registerTools";
import { registerMapTools } from "@map-tools/registerMapTools";
import { registerBasemaps } from "@map-tools/registerBasemaps";
import { registerModules } from "@modules/registerModules";
import { assertKnownProtocols } from "@core/domain/layer-tree";

/**
 * Everything bootstrap consumes — supplied by the assembly: the demo's
 * `main.tsx` (appConfig + runtime-config.json) or the embed facade
 * (`createMapdeck` options). No IO happens here.
 */
export interface BootstrapOptions {
    /** Source type served when none is named — must match a registered source adapter. */
    readonly defaultSourceType: string;
    /** Per-basemap raster tile URL overrides of the deployment's runtime config. */
    readonly basemapTileOverrides?: Readonly<
        Record<string, readonly string[]>
    >;
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
        await registerBasemaps(rootStore, options.basemapTileOverrides);
        registerProtocols(
            rootStore,
            options.lazPerfWasmUrl
                ? { lazPerfWasmUrl: options.lazPerfWasmUrl }
                : {},
        );
        await registerModules(rootStore.moduleContext, options.modules);
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
