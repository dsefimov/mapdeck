import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BasemapStore } from "./BasemapStore";
import type { BaseMapConfig } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";

const CONFIG_A: BaseMapConfig = {
    id: "bm-a",
    name: "Alpha",
    style: {
        version: 8,
        sources: {
            a: { type: "raster", tiles: ["https://a.example/{z}/{x}/{y}.png"] },
        },
        layers: [],
    },
};

const CONFIG_B: BaseMapConfig = {
    id: "bm-b",
    name: "Beta",
    style: {
        version: 8,
        sources: {
            b: { type: "raster", tiles: ["https://b.example/{z}/{x}/{y}.png"] },
        },
        layers: [],
    },
};

function storeStub(): StoreRegistry {
    return {
        settingsStore: {
            getStringSetting: vi.fn((): string | undefined => undefined),
            setSetting: vi.fn(),
            updateSettingOptions: vi.fn(),
        },
        mapStore: {
            removeOwnedLayers: vi.fn(),
            applyStyleFragment: vi.fn(),
        },
    } as unknown as StoreRegistry;
}

/** HEAD/JSON responses per URL substring; missing entries reject. */
function stubFetch(
    outcomes: Record<string, { ok: boolean; json?: unknown }>,
): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            for (const [fragment, outcome] of Object.entries(outcomes)) {
                if (url.includes(fragment)) {
                    return {
                        ok: outcome.ok,
                        status: outcome.ok ? 200 : 500,
                        json: async () => outcome.json,
                    };
                }
            }
            throw new Error(`network failure for ${url}`);
        }),
    );
}

async function makeStore(rootStore: StoreRegistry): Promise<BasemapStore> {
    const store = new BasemapStore(rootStore);
    await store.registerConfigs([CONFIG_A, CONFIG_B]);
    return store;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("BasemapStore — registration", () => {
    it("throws on a duplicate id without override", async () => {
        const store = await makeStore(storeStub());

        await expect(
            store.registerConfigs([CONFIG_A]),
        ).rejects.toThrow(/already registered/);
    });

    it("rejects a duplicate inside one batch", async () => {
        const store = new BasemapStore(storeStub());

        await expect(
            store.registerConfigs([CONFIG_A, { ...CONFIG_A, name: "copy" }]),
        ).rejects.toThrow(/appears twice/);
    });

    it("throws when a concurrent registration races the same id", async () => {
        const store = new BasemapStore(storeStub());

        const first = store.registerConfigs([CONFIG_A]);
        const second = store.registerConfigs([CONFIG_A]);

        await expect(second).rejects.toThrow(/already registered/);
        await first;
        expect(store.availableBasemaps).toHaveLength(1);
    });

    it("replaces in place with override and drops the stale health status", async () => {
        stubFetch({ "a.example": { ok: true } });
        const store = await makeStore(storeStub());
        store.refreshHealthStatuses();
        await vi.waitFor(() =>
            expect(store.healthStatuses.get("bm-a")).toBe("success"),
        );

        const replacement = { ...CONFIG_A, name: "Alpha corp" };
        await store.registerConfigs([replacement], { override: true });

        expect(store.availableBasemaps).toHaveLength(2);
        expect(store.availableBasemaps[0]).toStrictEqual(replacement);
        expect(store.healthStatuses.has("bm-a")).toBe(false);
    });

    it("does not re-apply the active basemap when an inactive one is overridden", async () => {
        stubFetch({ example: { ok: true } });
        const rootStore = storeStub();
        (rootStore.settingsStore.getStringSetting as ReturnType<typeof vi.fn>)
            .mockReturnValue("bm-a");
        const store = await makeStore(rootStore);
        store.applyBasemap(CONFIG_A);
        const apply = rootStore.mapStore.applyStyleFragment as ReturnType<
            typeof vi.fn
        >;
        apply.mockClear();

        await store.registerConfigs([{ ...CONFIG_B, name: "Beta corp" }], {
            override: true,
        });

        expect(apply).not.toHaveBeenCalled();
    });

    it("fails a colliding batch without partial registration", async () => {
        const store = await makeStore(storeStub());
        const fresh: BaseMapConfig = {
            id: "bm-new",
            name: "New",
            style: CONFIG_A.style!,
        };

        await expect(
            store.registerConfigs([fresh, CONFIG_B]),
        ).rejects.toThrow(/already registered/);

        expect(store.availableBasemaps.map((bm) => bm.id)).toEqual([
            "bm-a",
            "bm-b",
        ]);
    });

    it("re-applies the active basemap when its config is overridden", async () => {
        stubFetch({ example: { ok: true } });
        const rootStore = storeStub();
        (rootStore.settingsStore.getStringSetting as ReturnType<typeof vi.fn>)
            .mockReturnValue("bm-a");
        const store = await makeStore(rootStore);
        store.applyBasemap(CONFIG_A);
        const apply = rootStore.mapStore.applyStyleFragment as ReturnType<
            typeof vi.fn
        >;
        apply.mockClear();

        const replacement: BaseMapConfig = {
            ...CONFIG_A,
            style: {
                ...CONFIG_A.style!,
                sources: {
                    corp: {
                        type: "raster",
                        tiles: ["https://corp.example/{z}/{x}/{y}.png"],
                    },
                },
            },
        };
        await store.registerConfigs([replacement], { override: true });

        expect(apply).toHaveBeenCalledTimes(1);
        expect(apply).toHaveBeenCalledWith(
            replacement.style,
            "basemap_",
            expect.any(Set),
        );
    });

    it("rejects a config with neither an inline style nor a styleUrl", async () => {
        const store = new BasemapStore(storeStub());

        await expect(
            store.registerConfigs([{ id: "bm-x", name: "X" }]),
        ).rejects.toThrow(/style/);
    });
});

describe("BasemapStore — styleUrl resolution", () => {
    const URL_CONFIG: BaseMapConfig = {
        id: "bm-url",
        name: "Fetched",
        styleUrl: "https://styles.example/style.json",
    };

    it("registers a styleUrl config with its fetched style", async () => {
        stubFetch({
            "styles.example": {
                ok: true,
                json: {
                    version: 8,
                    sources: { s: { type: "raster", tiles: ["https://t/{z}/{x}/{y}"] } },
                    layers: [],
                },
            },
        });
        const store = new BasemapStore(storeStub());

        await store.registerConfigs([URL_CONFIG]);

        expect(store.availableBasemaps[0]?.style?.sources).toBeDefined();
    });

    it("keeps the config registered and reports it unhealthy when the fetch fails", async () => {
        stubFetch({});
        const store = new BasemapStore(storeStub());

        await store.registerConfigs([URL_CONFIG]);
        await store.findAndApplyInitialBasemap();

        expect(store.availableBasemaps).toHaveLength(1);
        expect(store.availableBasemaps[0]?.style).toBeUndefined();
        expect(store.healthStatuses.get("bm-url")).toBe("error");
    });
});

describe("BasemapStore — setting repair", () => {
    it("repairs a dangling value and declares the first option as default", async () => {
        const rootStore = storeStub();
        (rootStore.settingsStore.getStringSetting as ReturnType<typeof vi.fn>)
            .mockReturnValue("ghost");
        const store = new BasemapStore(rootStore);

        await store.registerConfigs([CONFIG_A, CONFIG_B]);

        expect(
            rootStore.settingsStore.updateSettingOptions,
        ).toHaveBeenCalledWith(
            "basemap.basemap",
            [
                { label: "Alpha", value: "bm-a" },
                { label: "Beta", value: "bm-b" },
            ],
            "bm-a",
        );
        expect(rootStore.settingsStore.setSetting).toHaveBeenCalledWith(
            "basemap.basemap",
            "bm-a",
        );
    });

    it("keeps a value that still names a registered basemap", async () => {
        const rootStore = storeStub();
        (rootStore.settingsStore.getStringSetting as ReturnType<typeof vi.fn>)
            .mockReturnValue("bm-b");
        await makeStore(rootStore);

        expect(rootStore.settingsStore.setSetting).not.toHaveBeenCalled();
    });

    it("touches nothing while the registry is empty", () => {
        const rootStore = storeStub();
        const store = new BasemapStore(rootStore);

        store.syncSettingOptions();

        expect(
            rootStore.settingsStore.updateSettingOptions,
        ).not.toHaveBeenCalled();
    });
});

describe("BasemapStore — health statuses", () => {
    it("probes every registered basemap concurrently and records outcomes", async () => {
        stubFetch({ "a.example": { ok: true }, "b.example": { ok: false } });
        const store = await makeStore(storeStub());

        store.refreshHealthStatuses();
        await vi.waitFor(() => {
            expect(store.healthStatuses.get("bm-a")).toBe("success");
        });
        await vi.waitFor(() => {
            expect(store.healthStatuses.get("bm-b")).toBe("error");
        });
    });

    it("never re-probes a basemap that already has a status", async () => {
        stubFetch({ example: { ok: true } });
        const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
        const store = await makeStore(storeStub());

        store.refreshHealthStatuses();
        await vi.waitFor(() => {
            expect(store.healthStatuses.size).toBe(2);
        });

        store.refreshHealthStatuses();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe("BasemapStore — initial basemap selection", () => {
    it("prefers the healthy active basemap and applies it once", async () => {
        stubFetch({ "a.example": { ok: true } });
        const rootStore = storeStub();
        (rootStore.settingsStore.getStringSetting as ReturnType<typeof vi.fn>)
            .mockReturnValue("bm-a");
        const store = await makeStore(rootStore);
        const setActive = vi.spyOn(store, "setActiveBasemap");

        await store.findAndApplyInitialBasemap();

        expect(setActive).not.toHaveBeenCalled();
        expect(rootStore.mapStore.applyStyleFragment).toHaveBeenCalledTimes(1);
        expect(rootStore.mapStore.applyStyleFragment).toHaveBeenCalledWith(
            CONFIG_A.style,
            "basemap_",
            expect.any(Set),
        );
    });

    it("falls back to the first healthy candidate when the active one fails", async () => {
        stubFetch({ "a.example": { ok: false }, "b.example": { ok: true } });
        const rootStore = storeStub();
        (rootStore.settingsStore.getStringSetting as ReturnType<typeof vi.fn>)
            .mockReturnValue("bm-a");
        const store = await makeStore(rootStore);
        const setActive = vi.spyOn(store, "setActiveBasemap");

        await store.findAndApplyInitialBasemap();

        expect(setActive).toHaveBeenCalledWith("bm-b");
        expect(rootStore.mapStore.applyStyleFragment).toHaveBeenCalledWith(
            CONFIG_B.style,
            "basemap_",
            expect.any(Set),
        );
    });

    it("records probe outcomes so the panel reuses them without re-probing", async () => {
        stubFetch({ "a.example": { ok: true }, "b.example": { ok: false } });
        const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
        const rootStore = storeStub();
        const store = await makeStore(rootStore);

        await store.findAndApplyInitialBasemap();
        expect(store.healthStatuses.size).toBe(2);
        const probesAfterInit = fetchMock.mock.calls.length;

        store.refreshHealthStatuses();

        expect(fetchMock).toHaveBeenCalledTimes(probesAfterInit);
    });

    it("probes every candidate concurrently — no candidate waits for another", async () => {
        const gates: Array<(ok: boolean) => void> = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(
                () =>
                    new Promise((resolve) => {
                        gates.push((ok) => resolve({ ok, status: ok ? 200 : 500 }));
                    }),
            ),
        );
        const rootStore = storeStub();
        const store = await makeStore(rootStore);

        let initDone = false;
        const init = store.findAndApplyInitialBasemap().then(() => {
            initDone = true;
        });

        // Both probes are in flight while neither response has arrived.
        await vi.waitFor(() => expect(gates.length).toBe(2));
        expect(initDone).toBe(false);

        gates[0]!(false);
        gates[1]!(true);
        await init;

        expect(store.healthStatuses.get("bm-a")).toBe("error");
        expect(store.healthStatuses.get("bm-b")).toBe("success");
        expect(rootStore.mapStore.applyStyleFragment).toHaveBeenCalledWith(
            CONFIG_B.style,
            "basemap_",
            expect.any(Set),
        );
    });
});

describe("BasemapStore — failed apply rollback", () => {
    it("restores the previous basemap when a switch fails mid-apply", async () => {
        stubFetch({ example: { ok: true } });
        const rootStore = storeStub();
        const store = await makeStore(rootStore);
        store.applyBasemap(CONFIG_A);

        const apply = rootStore.mapStore.applyStyleFragment as ReturnType<
            typeof vi.fn
        >;
        apply.mockImplementationOnce(() => {
            throw new Error("fragment rejected");
        });

        store.applyBasemap(CONFIG_B);

        expect(apply).toHaveBeenCalledTimes(3);
        expect(apply).toHaveBeenLastCalledWith(
            CONFIG_A.style,
            "basemap_",
            expect.any(Set),
        );
    });

    it("a first-ever failed apply leaves the map empty without a restore attempt", async () => {
        stubFetch({ example: { ok: true } });
        const rootStore = storeStub();
        const apply = rootStore.mapStore.applyStyleFragment as ReturnType<
            typeof vi.fn
        >;
        apply.mockImplementationOnce(() => {
            throw new Error("fragment rejected");
        });
        const store = await makeStore(rootStore);

        store.applyBasemap(CONFIG_A);

        expect(apply).toHaveBeenCalledTimes(1);
    });
});
