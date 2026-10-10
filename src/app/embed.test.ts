import { describe, expect, it, vi } from "vitest";
import type { LayerAdapter, Module, Protocol } from "@core/contracts";
import { createMapdeck } from "./embed";

// The built-in module set would register the real STAC adapter and reach
// for the network on initialize; the subject here is the embed plumbing.
vi.mock("@modules/registerModules", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    builtInModules: [],
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

describe("createMapdeck", () => {
    it("registers the consumer module's content through the context", async () => {
        const instance = createMapdeck({ modules: [consumerModule] });

        await vi.waitFor(() => {
            expect(
                instance.store.protocolRegistry.getById(CONSUMER_PROTOCOL_ID),
            ).toBeDefined();
        });
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
