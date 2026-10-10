import { describe, it, expect, vi } from "vitest";
import type {
    BaseMapConfig,
    FeatureProvider,
    LayerAdapter,
    Protocol,
} from "@core/contracts";
import { RootStore } from "./rootStore";

describe("RootStore composition", () => {
    it("constructs all stores and links them through the registry", () => {
        const store = new RootStore();

        expect(store.treeStore.rootStore).toBe(store);
        expect(store.mapStore.rootStore).toBe(store);
        expect(store.mapToolStore.rootStore).toBe(store);
    });

    it("registers the core dictionary into the locale store during construction", () => {
        const store = new RootStore();

        expect(Object.keys(store.localeStore.t("core"))).not.toHaveLength(0);
    });
});

/** Registration exercises registry identity, never rendering. */
const noopAdapter: LayerAdapter = {
    nativeLayerOrdering: false,
    addToMap: () => {},
    removeFromMap: () => {},
    updateVisibility: () => {},
    updateConfig: () => {},
};

const moduleProtocol: Protocol = {
    id: "module-protocol",
    label: "Module-registered protocol",
    defaultStyle: {},
    createRenderDescriptor: (sourceUrl) => ({ sourceUrl, config: {} }),
    getLayerAdapter: () => noopAdapter,
};

describe("RootStore module context: registration surfaces", () => {
    it("registers a protocol through moduleContext.protocols and reads it back", () => {
        const store = new RootStore();

        store.moduleContext.protocols.register(moduleProtocol);

        expect(store.moduleContext.protocols.getById("module-protocol")).toBe(
            moduleProtocol,
        );
    });

    it("rejects a duplicate protocol id without override", () => {
        const store = new RootStore();
        store.moduleContext.protocols.register(moduleProtocol);

        expect(() =>
            store.moduleContext.protocols.register(moduleProtocol),
        ).toThrow();
    });

    it("registers a feature provider through moduleContext.featureProviders", () => {
        const store = new RootStore();
        const provider: FeatureProvider = { collect: () => [] };

        store.moduleContext.featureProviders.register(
            "module-provider",
            provider,
        );

        expect(
            store.moduleContext.featureProviders.has("module-provider"),
        ).toBe(true);
        expect(store.moduleContext.featureProviders.getAll()).toContain(
            provider,
        );
    });

    it("registers translations through moduleContext.locale and reads them back", () => {
        const store = new RootStore();

        store.moduleContext.locale.registerTranslations("module-ns", {
            en: { greeting: "Hello" },
        });

        expect(store.moduleContext.locale.t("module-ns")).toEqual({
            greeting: "Hello",
        });
    });

    it("declares settings through moduleContext.settings", () => {
        const store = new RootStore();

        store.moduleContext.settings.registerSettings(
            "module-owner",
            "Module owner",
            [
                {
                    id: "module.flag",
                    label: "Flag",
                    type: "boolean",
                    defaultValue: false,
                },
            ],
        );

        expect(store.settingsStore.getBooleanSetting("module.flag")).toBe(false);
    });

    it("registers basemaps through moduleContext.basemap", async () => {
        const store = new RootStore();
        const moduleBasemap: BaseMapConfig = {
            id: "module-basemap",
            name: "Module basemap",
            style: {
                version: 8,
                sources: {
                    corp: {
                        type: "raster",
                        tiles: ["https://tiles.corp.local/{z}/{x}/{y}.png"],
                        tileSize: 256,
                    },
                },
                layers: [],
            },
        };

        await store.moduleContext.basemap.registerConfigs([moduleBasemap]);

        expect(
            store.moduleContext.basemap.availableBasemaps.map((bm) => bm.id),
        ).toContain("module-basemap");
    });
});

describe("RootStore initialization state", () => {
    it("starts uninitialized and error-free", () => {
        const store = new RootStore();

        expect(store.isInitialized).toBe(false);
        expect(store.initError).toBeNull();
    });

    it("rejects an empty default source type with a visible error", async () => {
        const store = new RootStore();

        await store.initialize("");

        expect(store.isInitialized).toBe(false);
        expect(store.initError).toMatch(/default source type/);
    });

    it("marks itself initialized once the tree refresh settles", async () => {
        const store = new RootStore();
        vi.spyOn(store.treeStore, "initAdapter").mockImplementation(() => {});
        vi.spyOn(store.treeStore, "refresh").mockResolvedValue(undefined);

        await store.initialize("stac");

        expect(store.isInitialized).toBe(true);
        expect(store.initError).toBeNull();
    });

    it("records a failed refresh as the init error and stays uninitialized", async () => {
        const store = new RootStore();
        vi.spyOn(store.treeStore, "initAdapter").mockImplementation(() => {});
        vi.spyOn(store.treeStore, "refresh").mockRejectedValue(
            new Error("no data source"),
        );

        await store.initialize("stac");

        expect(store.isInitialized).toBe(false);
        expect(store.initError).toBe("no data source");
    });

    it.each([
        ["an Error", new Error("boom"), "boom"],
        ["a non-Error", "boom", "Unknown error"],
    ])("normalizes %s rejection into the message", async (_case, thrown, expected) => {
        const store = new RootStore();
        vi.spyOn(store.treeStore, "initAdapter").mockImplementation(() => {});
        vi.spyOn(store.treeStore, "refresh").mockRejectedValue(thrown);

        await store.initialize("stac");

        expect(store.initError).toBe(expected);
    });

    it("retries cleanly: a fresh initialize clears the stale error", async () => {
        const store = new RootStore();
        vi.spyOn(store.treeStore, "initAdapter").mockImplementation(() => {});
        const refresh = vi
            .spyOn(store.treeStore, "refresh")
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce(undefined);

        await store.initialize("stac");
        await store.initialize("stac");

        expect(refresh).toHaveBeenCalledTimes(2);
        expect(store.isInitialized).toBe(true);
        expect(store.initError).toBeNull();
    });

    it("resets isInitialized for the duration of a re-run", async () => {
        const store = new RootStore();
        vi.spyOn(store.treeStore, "initAdapter").mockImplementation(() => {});
        let flagDuringSecondRun: boolean | undefined;
        vi.spyOn(store.treeStore, "refresh").mockImplementation(async () => {
            flagDuringSecondRun = store.isInitialized;
        });

        await store.initialize("stac");
        await store.initialize("stac");

        expect(flagDuringSecondRun).toBe(false);
        expect(store.isInitialized).toBe(true);
    });

    it("a failed re-initialization clears the initialized flag", async () => {
        const store = new RootStore();
        vi.spyOn(store.treeStore, "initAdapter").mockImplementation(() => {});
        vi.spyOn(store.treeStore, "refresh")
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("offline again"));

        await store.initialize("stac");
        await store.initialize("stac");

        expect(store.isInitialized).toBe(false);
        expect(store.initError).toBe("offline again");
    });

    it("clearInitError resets the message without touching the flag", () => {
        const store = new RootStore();
        store.setInitError(new Error("boom"));

        store.clearInitError();

        expect(store.initError).toBeNull();
        expect(store.isInitialized).toBe(false);
    });
});

describe("RootStore disposal", () => {
    it("disposes resource-owning stores in reverse construction order", () => {
        const store = new RootStore();
        const calls: string[] = [];

        // Only three stores own resources; their relative construction order
        // is tree → map → basemap, so disposal must run basemap first.
        for (const name of ["treeStore", "mapStore", "basemapStore"] as const) {
            vi.spyOn(store[name], "dispose").mockImplementation(() => {
                calls.push(name);
            });
        }

        store.dispose();

        expect(calls).toEqual(["basemapStore", "mapStore", "treeStore"]);
    });

    it("calling dispose twice is safe", () => {
        const store = new RootStore();

        expect(() => {
            store.dispose();
            store.dispose();
        }).not.toThrow();
    });
});
