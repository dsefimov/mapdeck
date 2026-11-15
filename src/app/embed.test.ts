import { describe, expect, it, vi } from "vitest";
import type {
    LayerAdapter,
    Module,
    ModuleContext,
    Protocol,
} from "@core/contracts";
import { createMapdeck } from "./embed";

const SHARED_PROTOCOL_ID = "shared-protocol";

// The real built-in module set registers the STAC adapter and would reach
// for the network on initialize; the subject here is the embed plumbing —
// a network-free stub proves the merge order just as well.
vi.mock("@modules/registerModules", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    builtInModules: [
        {
            id: "builtin-stub",
            name: "Built-in stub",
            register(context: ModuleContext) {
                context.protocols.register({
                    ...consumerProtocol,
                    id: SHARED_PROTOCOL_ID,
                    label: "Built-in version",
                });
            },
        },
    ],
}));

/** Registration exercises registry identity, never rendering. */
const noopAdapter: LayerAdapter = {
    nativeLayerOrdering: false,
    addToMap: () => {},
    removeFromMap: () => {},
    updateVisibility: () => {},
    updateConfig: () => {},
};

const CONSUMER_PROTOCOL_ID = "consumer-protocol";

const DATA_SOURCE_ID = "test.data-source-url";
const OVERRIDDEN_URL = "https://api.example/stac";

const consumerProtocol: Protocol = {
    id: CONSUMER_PROTOCOL_ID,
    label: "Consumer protocol",
    defaultStyle: {},
    createRenderDescriptor: (sourceUrl) => ({ sourceUrl, config: {} }),
    getLayerAdapter: () => noopAdapter,
};

const consumerModule: Module = {
    id: "consumer",
    name: "Consumer",
    register(context) {
        context.protocols.register(consumerProtocol);
        context.locale.registerTranslations("consumer-ns", {
            ru: { hello: "Привет" },
        });
    },
};

/** Overrides the built-in stub's shared protocol — legal only after it. */
const overridingModule: Module = {
    id: "overriding-consumer",
    name: "Overriding consumer",
    register(context) {
        context.protocols.register(
            {
                ...consumerProtocol,
                id: SHARED_PROTOCOL_ID,
                label: "Consumer version",
            },
            { override: true },
        );
    },
};

/** Host-module shape: declares a setting and the adapter initialize() needs. */
const settingsModule: Module = {
    id: "settings-host",
    name: "Settings host",
    register(context) {
        context.settings.registerSettings("settings-host", "Settings host", [
            {
                id: DATA_SOURCE_ID,
                type: "string",
                defaultValue: "./catalog.json",
                label: "Data source URL",
            },
        ]);
        context.sourceAdapterFactory.register({
            type: "stac",
            fetchRoot: () => Promise.resolve([]),
            fetchChildren: () => Promise.resolve([]),
            initialize: () => undefined,
            dispose: () => undefined,
        });
    },
};

describe("createMapdeck", () => {
    it("merges the built-in set before the consumer's modules", async () => {
        const instance = createMapdeck({ modules: [overridingModule] });

        // Were the merge order reversed, the built-in stub's non-override
        // registration of the shared id would throw into initError.
        await vi.waitFor(() => {
            expect(
                instance.store.protocolRegistry.getById(SHARED_PROTOCOL_ID)
                    ?.label,
            ).toBe("Consumer version");
        });
        // No adapter for "stac" in this fixture — that init failure is
        // expected; a duplicate registration is the failure being excluded.
        expect(instance.initError ?? "").not.toMatch(/already registered/);
        instance.dispose();
    });

    it("applies the initial language after registrations", async () => {
        const instance = createMapdeck({
            modules: [consumerModule],
            language: "ru",
        });

        await vi.waitFor(() => {
            expect(instance.store.localeStore.t("consumer-ns")).toEqual({
                hello: "Привет",
            });
        });
        instance.dispose();
    });

    it("surfaces a failed boot as initError and stays uninitialized", async () => {
        const instance = createMapdeck({ defaultSourceType: "stac" });

        await vi.waitFor(() => {
            expect(instance.initError).toMatch(/No source adapter registered/);
        });
        expect(instance.isInitialized).toBe(false);
    });

    it("applies settingsOverrides after all registrations", async () => {
        const instance = createMapdeck({
            modules: [settingsModule],
            settingsOverrides: { [DATA_SOURCE_ID]: OVERRIDDEN_URL },
        });

        await vi.waitFor(() => {
            expect(instance.isInitialized).toBe(true);
        });
        expect(
            instance.store.settingsStore.getStringSetting(
                DATA_SOURCE_ID,
            ),
        ).toBe(OVERRIDDEN_URL);
        instance.dispose();
    });

    it("an unknown settingsOverrides id fails initialization visibly", async () => {
        const instance = createMapdeck({
            modules: [settingsModule],
            settingsOverrides: { "test.ghost": "value" },
        });

        await vi.waitFor(() => {
            expect(instance.initError).toMatch(/test\.ghost \(notfound\)/);
        });
        expect(instance.isInitialized).toBe(false);
        instance.dispose();
    });

    it("restart() re-applies settingsOverrides over the defaults", async () => {
        const instance = createMapdeck({
            modules: [settingsModule],
            settingsOverrides: { [DATA_SOURCE_ID]: OVERRIDDEN_URL },
        });
        await vi.waitFor(() => {
            expect(instance.isInitialized).toBe(true);
        });

        await instance.restart();

        await vi.waitFor(() => {
            expect(instance.isInitialized).toBe(true);
        });
        expect(
            instance.store.settingsStore.getStringSetting(
                DATA_SOURCE_ID,
            ),
        ).toBe(OVERRIDDEN_URL);
        instance.dispose();
    });

    it("restart() swaps in a fresh store and re-registers", async () => {
        const instance = createMapdeck({ modules: [consumerModule] });
        const firstStore = instance.store;
        await vi.waitFor(() => {
            expect(
                firstStore.protocolRegistry.getById(CONSUMER_PROTOCOL_ID),
            ).toBeDefined();
        });

        await instance.restart();

        expect(instance.store).not.toBe(firstStore);
        await vi.waitFor(() => {
            expect(
                instance.store.protocolRegistry.getById(CONSUMER_PROTOCOL_ID),
            ).toBeDefined();
        });
        instance.dispose();
    });

    it("two sequential instances in one process work", async () => {
        const first = createMapdeck({});
        first.dispose();

        const second = createMapdeck({ modules: [consumerModule] });
        await vi.waitFor(() => {
            expect(
                second.store.protocolRegistry.getById(CONSUMER_PROTOCOL_ID),
            ).toBeDefined();
        });
        second.dispose();
    });
});
