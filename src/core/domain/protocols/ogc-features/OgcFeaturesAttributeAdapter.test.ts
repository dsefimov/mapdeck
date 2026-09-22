import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttributeFetchRequest, ProtocolBinding } from "@core/contracts";
import { OgcFeaturesAttributeAdapter } from "./OgcFeaturesAttributeAdapter";

const binding = {
    protocolId: "ogc-features",
    sourceUrl: "https://example.test/items",
    params: {},
} as unknown as ProtocolBinding;

const request: AttributeFetchRequest = { startIndex: 0 };

interface FetchStubOptions {
    status?: number;
    payload?: unknown;
}

/** OGC page fetch at the network boundary — the adapter's mapping is the subject. */
function stubPageFetch({
    status = 200,
    payload = {
        type: "FeatureCollection",
        features: [
            { id: "a", geometry: { type: "Point", coordinates: [1, 2] }, properties: { n: 1 } },
            { geometry: null, properties: { n: 2 } },
        ],
        numberMatched: 7,
    },
}: FetchStubOptions = {}): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => ({
        ok: status < 400,
        status,
        statusText: status === 429 ? "Too Many Requests" : "OK",
        headers: { get: () => "application/json" },
        json: async () => payload,
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("OgcFeaturesAttributeAdapter request mapping", () => {
    it("issues one request with default paging and passes the result through", async () => {
        const fetchMock = stubPageFetch();
        const adapter = new OgcFeaturesAttributeAdapter();

        const result = await adapter.fetchAttributes(binding, request);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://example.test/items?offset=0&limit=50");
        expect((init.headers as Record<string, string>)["Accept"]).toBe(
            "application/geo+json",
        );
        expect(result.features).toHaveLength(2);
        expect(result.totalFeatures).toBe(7);
    });

    it.each([
        ["clamps maxFeatures to the 500 page ceiling", { maxFeatures: 2000 }, "offset=0&limit=500"],
        ["keeps an explicit smaller page size", { maxFeatures: 25 }, "offset=0&limit=25"],
        ["defaults maxFeatures to 50", {}, "offset=0&limit=50"],
        ["maps startIndex to offset", { startIndex: 120, maxFeatures: 60 }, "offset=120&limit=60"],
    ])("%s", async (_case, requestOverride, expectedQuery) => {
        const fetchMock = stubPageFetch();
        const adapter = new OgcFeaturesAttributeAdapter();

        await adapter.fetchAttributes(
            binding,
            requestOverride as AttributeFetchRequest,
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`https://example.test/items?${expectedQuery}`);
    });

    it("preserves query parameters already present on the source URL", async () => {
        const fetchMock = stubPageFetch();
        const adapter = new OgcFeaturesAttributeAdapter();
        const withQuery = {
            ...binding,
            sourceUrl: "https://example.test/items?f=json",
        };

        await adapter.fetchAttributes(withQuery, request);

        const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
        const parsed = new URL(url);
        expect(parsed.searchParams.get("f")).toBe("json");
        expect(parsed.searchParams.get("offset")).toBe("0");
        expect(parsed.searchParams.get("limit")).toBe("50");
    });
});

describe("OgcFeaturesAttributeAdapter rate limiting", () => {
    it("spaces consecutive calls by the rate-limit interval", async () => {
        vi.useFakeTimers();
        const fetchMock = stubPageFetch();
        const adapter = new OgcFeaturesAttributeAdapter();

        const first = adapter.fetchAttributes(binding, { startIndex: 0 });
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const second = adapter.fetchAttributes(binding, { startIndex: 50 });
        await vi.advanceTimersByTimeAsync(500);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(600);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [secondUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(secondUrl).toBe("https://example.test/items?offset=50&limit=50");

        await Promise.all([first, second]);
    });

    it("an abort during the wait rejects immediately, not after the interval", async () => {
        vi.useFakeTimers();
        stubPageFetch();
        const adapter = new OgcFeaturesAttributeAdapter();
        const controller = new AbortController();

        // The first call occupies the slot; the second must wait it out.
        const first = adapter.fetchAttributes(binding, request);
        const second = adapter.fetchAttributes(
            binding,
            request,
            controller.signal,
        );
        controller.abort();

        await expect(second).rejects.toThrow("Aborted");

        await vi.advanceTimersByTimeAsync(1100);
        await first;
    });

    it("rejects a pre-aborted request without touching the network", async () => {
        const fetchMock = stubPageFetch();
        const adapter = new OgcFeaturesAttributeAdapter();
        const controller = new AbortController();
        controller.abort();

        await expect(
            adapter.fetchAttributes(binding, request, controller.signal),
        ).rejects.toThrow("Aborted");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("OgcFeaturesAttributeAdapter failure passthrough", () => {
    it("propagates HTTP failures with the protocol label and status", async () => {
        stubPageFetch({ status: 429 });
        const adapter = new OgcFeaturesAttributeAdapter();

        await expect(
            adapter.fetchAttributes(binding, request),
        ).rejects.toThrow("OGC Features returned 429 Too Many Requests");
    });

    it("rejects a payload that is not a FeatureCollection", async () => {
        stubPageFetch({ payload: { type: "Feature" } });
        const adapter = new OgcFeaturesAttributeAdapter();

        await expect(
            adapter.fetchAttributes(binding, request),
        ).rejects.toThrow("OGC Features response is not a valid FeatureCollection");
    });
});
