import { describe, it, expect, vi } from "vitest";
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

describe("RootStore initialization state", () => {
    it("starts uninitialized and error-free", () => {
        const store = new RootStore();

        expect(store.isInitialized).toBe(false);
        expect(store.initError).toBeNull();
    });

    it("marks itself initialized once the tree refresh settles", async () => {
        const store = new RootStore();
        vi.spyOn(store.treeStore, "initAdapter").mockImplementation(() => {});
        vi.spyOn(store.treeStore, "refresh").mockResolvedValue(undefined);

        await store.initialize();

        expect(store.isInitialized).toBe(true);
        expect(store.initError).toBeNull();
    });

    it("records a failed refresh as the init error and stays uninitialized", async () => {
        const store = new RootStore();
        vi.spyOn(store.treeStore, "initAdapter").mockImplementation(() => {});
        vi.spyOn(store.treeStore, "refresh").mockRejectedValue(
            new Error("no data source"),
        );

        await store.initialize();

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

        await store.initialize();

        expect(store.initError).toBe(expected);
    });

    it("retries cleanly: a fresh initialize clears the stale error", async () => {
        const store = new RootStore();
        vi.spyOn(store.treeStore, "initAdapter").mockImplementation(() => {});
        const refresh = vi
            .spyOn(store.treeStore, "refresh")
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce(undefined);

        await store.initialize();
        await store.initialize();

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

        await store.initialize();
        await store.initialize();

        expect(flagDuringSecondRun).toBe(false);
        expect(store.isInitialized).toBe(true);
    });

    it("a failed re-initialization clears the initialized flag", async () => {
        const store = new RootStore();
        vi.spyOn(store.treeStore, "initAdapter").mockImplementation(() => {});
        vi.spyOn(store.treeStore, "refresh")
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("offline again"));

        await store.initialize();
        await store.initialize();

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
