import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@core/lib/logger";
import { isSTACCollection } from "../types";
import { STACClient } from "./STACClient";

function stubFetch(body: unknown): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => body,
        })),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const client = new STACClient({ url: "https://stac.test" });

describe("STACClient entity gate", () => {
    it("accepts a well-formed collection", async () => {
        stubFetch({
            stac_version: "1.0.0",
            type: "Collection",
            id: "c1",
            description: "d",
            links: [],
        });

        const entity = await client.fetchEntity("https://stac.test/c1");

        expect(isSTACCollection(entity)).toBe(true);
        expect(entity).toMatchObject({ id: "c1" });
    });

    it("reports an HTTP status once, with the URL — no double wrapping", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: false,
                status: 404,
                statusText: "Not Found",
                json: async () => ({}),
            })),
        );

        const error = await client
            .fetchEntity("https://stac.test/missing")
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(
            "HTTP 404: Not Found (https://stac.test/missing)",
        );
    });

    it.each([
        ["an unknown type value", { stac_version: "1.0.0", type: "Nonsense", id: "x" }],
        ["a missing id", { stac_version: "1.0.0", type: "Collection" }],
        ["a non-string stac_version", { stac_version: 1, type: "Collection", id: "x" }],
    ])("rejects %s", async (_case, body) => {
        stubFetch(body);

        await expect(
            client.fetchEntity("https://stac.test/x"),
        ).rejects.toThrow("does not appear to be a valid STAC entity");
    });
});

describe("STACClient collection elements", () => {
    it("drops malformed entries with a warning", async () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        stubFetch({
            collections: [
                { stac_version: "1.0.0", type: "Collection", id: "good", description: "", links: [] },
                { type: "Collection" },
                "junk",
            ],
        });

        const collections = await client.fetchCollections(
            "https://stac.test/collections",
        );

        expect(collections).toHaveLength(1);
        expect(collections[0]?.id).toBe("good");
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("2 malformed collection"));
    });
});

describe("STACClient item elements", () => {
    const feature = (id: string) => ({
        stac_version: "1.0.0",
        type: "Feature",
        id,
        bbox: [0, 0, 1, 1],
        properties: {},
        assets: {},
    });

    it("drops malformed features with a warning", async () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        stubFetch({
            type: "FeatureCollection",
            features: [feature("f1"), { type: "Feature" }, 5],
            links: [],
        });

        const items = await client.fetchItemsAll("https://stac.test/items");

        expect(items).toHaveLength(1);
        expect(items[0]?.id).toBe("f1");
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("2 malformed item"));
    });

    it("rejects a single-feature response without an id", async () => {
        stubFetch({ type: "Feature" });

        await expect(
            client.fetchItemsAll("https://stac.test/item"),
        ).rejects.toThrow("not a valid STAC Item or FeatureCollection");
    });
});
