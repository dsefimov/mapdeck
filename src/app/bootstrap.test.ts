import { describe, it, expect, vi } from "vitest";
import type { Module, SourceAdapter } from "@core/contracts";
import { bootstrap } from "./bootstrap";
import { RootStore } from "./rootStore";

// The subject is bootstrap sequencing, not module internals: the real STAC
// module would reach for the network.
const registerModulesMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@modules/registerModules", () => ({
    registerModules: registerModulesMock,
}));

/**
 * Offline source adapter: an empty catalog, no network. Registered under the
 * assembly's default source type — the real module is mocked out.
 */
function stubAdapter(type: string = "stac"): SourceAdapter {
    return {
        type,
        fetchRoot: () => Promise.resolve([]),
        fetchChildren: () => Promise.resolve([]),
        initialize: () => undefined,
        dispose: () => undefined,
    };
}

function stubModule(id: string): Module {
    return { id, name: id, register: async () => {} };
}

function testOptions(modules: readonly Module[] = []) {
    return { defaultSourceType: "stac", modules };
}

describe("bootstrap", () => {
    it("initializes a fresh store against an empty catalog", async () => {
        const store = new RootStore();
        store.sourceAdapterFactory.register(stubAdapter());

        await bootstrap(store, testOptions());

        expect(store.isInitialized).toBe(true);
        expect(store.initError).toBeNull();
    });

    it("passes the module list through to registerModules", async () => {
        const store = new RootStore();
        store.sourceAdapterFactory.register(stubAdapter());
        const modules = [stubModule("consumer-module")];

        await bootstrap(store, testOptions(modules));

        expect(registerModulesMock).toHaveBeenCalledWith(
            store.moduleContext,
            modules,
        );
    });

    it("a configured source type with no registered adapter fails initialization visibly", async () => {
        const store = new RootStore();

        await bootstrap(store, testOptions());

        expect(store.isInitialized).toBe(false);
        expect(store.initError).toMatch(/No source adapter registered/);
    });

    it("a retry bootstraps cleanly into its own fresh store", async () => {
        const first = new RootStore();
        first.sourceAdapterFactory.register(stubAdapter());
        await bootstrap(first, testOptions());

        const second = new RootStore();
        second.sourceAdapterFactory.register(stubAdapter());
        await bootstrap(second, testOptions());

        expect(second.isInitialized).toBe(true);
        expect(second.widgetStore.allWidgets.length).toBeGreaterThan(0);
    });

    it("re-running bootstrap on a populated store records duplicate registration — a retry must use a fresh store", async () => {
        const store = new RootStore();
        store.sourceAdapterFactory.register(stubAdapter());
        await bootstrap(store, testOptions());

        await bootstrap(store, testOptions());

        expect(store.initError).toMatch(/already registered/);
    });

    it("a tool bound to an unregistered protocol fails the validation pass", async () => {
        const store = new RootStore();
        store.sourceAdapterFactory.register(stubAdapter());
        store.layerToolStore.registerTool({
            id: "extra-tool",
            component: () => null,
        });
        store.layerToolStore.bindToolToProtocol("nope", "renderer", "extra-tool");

        await bootstrap(store, testOptions());

        expect(store.isInitialized).toBe(false);
        expect(store.initError).toMatch(/unregistered protocols: "nope"/);
    });
});
