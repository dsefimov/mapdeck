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

/** HEAD responses per URL substring; missing entries reject (network fail). */
function stubFetch(outcomes: Record<string, boolean>): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            for (const [fragment, ok] of Object.entries(outcomes)) {
                if (url.includes(fragment)) {
                    return { ok, status: ok ? 200 : 500 };
                }
            }
            throw new Error(`network failure for ${url}`);
        }),
    );
}

function makeStore(rootStore: StoreRegistry): BasemapStore {
    const store = new BasemapStore(rootStore);
    store.registerConfigs([CONFIG_A, CONFIG_B]);
    return store;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("BasemapStore — health statuses", () => {
    it("probes every registered basemap concurrently and records outcomes", async () => {
        stubFetch({ "a.example": true, "b.example": false });
        const store = makeStore(storeStub());

        store.refreshHealthStatuses();
        await vi.waitFor(() => {
            expect(store.healthStatuses.get("bm-a")).toBe("success");
        });
        await vi.waitFor(() => {
            expect(store.healthStatuses.get("bm-b")).toBe("error");
        });
    });

    it("never re-probes a basemap that already has a status", async () => {
        stubFetch({ example: true });
        const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
        const store = makeStore(storeStub());

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
        stubFetch({ "a.example": true });
        const rootStore = storeStub();
        (rootStore.settingsStore.getStringSetting as ReturnType<typeof vi.fn>)
            .mockReturnValue("bm-a");
        const store = makeStore(rootStore);
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
        stubFetch({ "a.example": false, "b.example": true });
        const rootStore = storeStub();
        (rootStore.settingsStore.getStringSetting as ReturnType<typeof vi.fn>)
            .mockReturnValue("bm-a");
        const store = makeStore(rootStore);
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
        stubFetch({ "a.example": true, "b.example": false });
        const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
        const rootStore = storeStub();
        const store = makeStore(rootStore);

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
        const store = makeStore(rootStore);

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
    it("restores the previous basemap when a switch fails mid-apply", () => {
        stubFetch({ example: true });
        const rootStore = storeStub();
        const store = makeStore(rootStore);
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

    it("a first-ever failed apply leaves the map empty without a restore attempt", () => {
        stubFetch({ example: true });
        const rootStore = storeStub();
        const apply = rootStore.mapStore.applyStyleFragment as ReturnType<
            typeof vi.fn
        >;
        apply.mockImplementationOnce(() => {
            throw new Error("fragment rejected");
        });
        const store = makeStore(rootStore);

        store.applyBasemap(CONFIG_A);

        expect(apply).toHaveBeenCalledTimes(1);
    });
});
