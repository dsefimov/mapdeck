import { makeAutoObservable, runInAction } from "mobx";
import type { Module, ModuleContext } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import { configureLogger, type LogLevel } from "@core/lib/logger";
import { builtInModules } from "@modules/registerModules";
import { configureMobX } from "./mobxConfig";
import { RootStore } from "./rootStore";
import { bootstrap, type BootstrapOptions } from "./bootstrap";
import type { SettingsOverrides } from "./applySettingsOverrides";

/**
 * The source adapter used when the assembly names none — the built-in
 * module set always registers it.
 */
const DEFAULT_SOURCE_TYPE = "stac";

/**
 * Everything the embedding assembly may tune. Options carry only what
 * cannot arrive through the module system: assembly policy (which
 * registered adapter is the default, whether the built-in basemap set
 * ships) and deployment data (where the wasm binary lives). Content —
 * protocols, providers, dictionaries, basemaps, widgets, tools — arrives
 * exclusively through modules.
 */
export interface MapdeckOptions {
    /** Source adapter for nodes naming none; must be registered. Default: "stac". */
    readonly defaultSourceType?: string;
    /** Whether the built-in basemap set registers. Default: true. */
    readonly builtinBasemaps?: boolean;
    /** Where the LazPerf decoder binary lives — point-cloud (COPC) only. */
    readonly lazPerfWasmUrl?: string;
    /**
     * Initial language. The available languages are whatever modules'
     * dictionaries registered; a namespace without a registration in the
     * current language falls back whole-dict to the built-in en one.
     */
    readonly language?: string;
    /** Log threshold. Default: "warn" — a shipped library is quiet. */
    readonly logLevel?: LogLevel;
    /**
     * Values for registered settings, applied after all registrations and
     * before the first tree fetch. Deployment data: where this install's
     * sources live (e.g. "layer-tree.data-source-url"). Unknown ids and
     * invalid values fail initialization visibly.
     */
    readonly settingsOverrides?: SettingsOverrides;
    /** Consumer modules, registered after the built-in set (may override). */
    readonly modules?: readonly Module[];
}

/**
 * The library handle: the current store registry (replaced on restart),
 * the module registration context, and the boot state the root component
 * gates on. Observability makes a store swap re-render the root.
 */
export interface MapdeckInstance {
    readonly store: StoreRegistry;
    readonly moduleContext: ModuleContext;
    readonly isInitialized: boolean;
    readonly initError: string | null;
    /** dispose the store and bootstrap again from scratch — a fresh registry set. */
    restart(): Promise<void>;
    /** Release the store's resources; the instance must not be used after. */
    dispose(): void;
}

/** The observable implementation behind {@link MapdeckInstance}. */
class EmbedInstance implements MapdeckInstance {
    private readonly _options: MapdeckOptions;
    private _store: RootStore;

    constructor(options: MapdeckOptions) {
        configureMobX();
        this._options = options;
        this._store = new RootStore();
        makeAutoObservable<EmbedInstance, "_options">(this, {
            _options: false,
        });
    }

    get store(): StoreRegistry {
        return this._store;
    }

    get moduleContext(): ModuleContext {
        return this._store.moduleContext;
    }

    get isInitialized(): boolean {
        return this._store.isInitialized;
    }

    get initError(): string | null {
        return this._store.initError;
    }

    async restart(): Promise<void> {
        this._store.dispose();
        const store = new RootStore();
        runInAction(() => {
            this._store = store;
        });
        await this._launch();
    }

    dispose(): void {
        this._store.dispose();
    }

    /** Register everything and initialize; failures land in the store's initError. */
    async launch(): Promise<void> {
        await this._launch();
    }

    private async _launch(): Promise<void> {
        try {
            await bootstrap(this._store, this._bootstrapOptions());
            const language = this._options.language;
            if (language) {
                this._store.localeStore.setLanguage(language);
            }
        } catch (error) {
            this._store.setInitError(error);
        }
    }

    private _bootstrapOptions(): BootstrapOptions {
        const options = this._options;
        return {
            defaultSourceType:
                options.defaultSourceType ?? DEFAULT_SOURCE_TYPE,
            ...(options.builtinBasemaps !== undefined
                ? { builtinBasemaps: options.builtinBasemaps }
                : {}),
            ...(options.lazPerfWasmUrl !== undefined
                ? { lazPerfWasmUrl: options.lazPerfWasmUrl }
                : {}),
            ...(options.settingsOverrides !== undefined
                ? { settingsOverrides: options.settingsOverrides }
                : {}),
            modules: [...builtInModules, ...(options.modules ?? [])],
        };
    }
}

/**
 * Create a mapdeck instance: synchronous, observable, self-bootstrapping.
 * The bootstrap runs fire-and-forget — its failures surface through the
 * instance's `initError`, never as an unhandled rejection. The library
 * installs no global error handlers; that remains the host's right.
 */
export function createMapdeck(options: MapdeckOptions = {}): MapdeckInstance {
    if (options.logLevel !== undefined) {
        configureLogger(options.logLevel);
    }
    const instance = new EmbedInstance(options);
    void instance.launch();
    return instance;
}
