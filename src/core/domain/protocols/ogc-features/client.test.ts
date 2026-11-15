import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PAGE_LIMIT, fetchOgcFeaturesPage } from "./client";

const COLLECTION_URL = "https://example.com/collections/parcels/items";

interface ResponseStub {
    ok: boolean;
    status?: number;
    statusText?: string;
    json?: () => Promise<unknown>;
}

function stubFetch(responses: ResponseStub[]): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn();
    for (const response of responses) {
        fetchMock.mockResolvedValueOnce({
            ok: response.ok,
            status: response.status ?? 200,
            statusText: response.statusText ?? "OK",
            json: response.json ?? (async () => ({})),
        });
    }
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function featureCollection(
    features: unknown[],
    extra?: Record<string, unknown>,
): unknown {
    return { type: "FeatureCollection", features, ...extra };
}

function pointFeature(
    id: string | number | undefined,
    properties: Record<string, unknown> | null,
): unknown {
    return {
        ...(id !== undefined ? { id } : {}),
        geometry: { type: "Point", coordinates: [30.5, 59.9] },
        properties,
    };
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchOgcFeaturesPage — request", () => {
    it("appends explicit offset/limit as query parameters", async () => {
        const fetchMock = stubFetch([
            { ok: true, json: async () => featureCollection([]) },
        ]);

        await fetchOgcFeaturesPage({
            url: COLLECTION_URL,
            offset: 100,
            limit: 25,
        });

        const requestedUrl = new URL(fetchMock.mock.calls[0]![0] as string);
        expect(requestedUrl.pathname).toBe("/collections/parcels/items");
        expect(requestedUrl.searchParams.get("offset")).toBe("100");
        expect(requestedUrl.searchParams.get("limit")).toBe("25");
    });

    it("falls back to default pagination when params omit them", async () => {
        const fetchMock = stubFetch([
            { ok: true, json: async () => featureCollection([]) },
        ]);

        await fetchOgcFeaturesPage({ url: COLLECTION_URL });

        const requestedUrl = new URL(fetchMock.mock.calls[0]![0] as string);
        expect(requestedUrl.searchParams.get("offset")).toBe("0");
        expect(requestedUrl.searchParams.get("limit")).toBe(
            String(DEFAULT_PAGE_LIMIT),
        );
    });
});

describe("fetchOgcFeaturesPage — rows", () => {
    it("spreads data properties into the row", async () => {
        stubFetch([
            {
                ok: true,
                json: async () =>
                    featureCollection([
                        pointFeature("parcel-1", { name: "A", area: 10 }),
                    ]),
            },
        ]);

        const page = await fetchOgcFeaturesPage({ url: COLLECTION_URL });

        expect(page.features[0]).toMatchObject({
            name: "A",
            area: 10,
        });
    });

    it("keeps the service-reserved `_bbox` over a colliding data key", async () => {
        stubFetch([
            {
                ok: true,
                json: async () =>
                    featureCollection([
                        pointFeature("svc-1", { _bbox: "spoof" }),
                    ]),
            },
        ]);

        const page = await fetchOgcFeaturesPage({ url: COLLECTION_URL });

        expect(page.features[0]!._bbox).not.toBe("spoof");
        expect(page.features[0]!._bbox).toMatchObject({ west: 30.5 });
    });

    it("derives `_bbox` from geometry and omits it when geometry is null", async () => {
        stubFetch([
            {
                ok: true,
                json: async () =>
                    featureCollection([
                        pointFeature("with-geom", {}),
                        {
                            id: "no-geom",
                            geometry: null,
                            properties: {},
                        },
                    ]),
            },
        ]);

        const page = await fetchOgcFeaturesPage({ url: COLLECTION_URL });

        expect(page.features[0]!._bbox).toMatchObject({
            west: 30.5,
            south: 59.9,
            east: 30.5,
            north: 59.9,
        });
        expect(page.features[1]!._bbox).toBeUndefined();
    });
});

describe("fetchOgcFeaturesPage — pager total", () => {
    it("uses server-reported numberMatched when present", async () => {
        stubFetch([
            {
                ok: true,
                json: async () =>
                    featureCollection([pointFeature(1, {})], {
                        numberMatched: 1234,
                    }),
            },
        ]);

        const page = await fetchOgcFeaturesPage({
            url: COLLECTION_URL,
            limit: 1,
        });

        expect(page.totalFeatures).toBe(1234);
    });

    it.each([
        {
            case: "null numberMatched on a full page",
            numberMatched: null as number | null | undefined,
            limit: 50,
            offset: 50,
            featureCount: 50,
            expected: 101,
        },
        {
            case: "absent numberMatched on a full page",
            numberMatched: undefined as number | null | undefined,
            limit: 50,
            offset: 50,
            featureCount: 50,
            expected: 101,
        },
        {
            case: "short last page",
            numberMatched: undefined as number | null | undefined,
            limit: 50,
            offset: 50,
            featureCount: 2,
            expected: 52,
        },
    ])("estimates the total: $case", async ({ numberMatched, limit, offset, featureCount, expected }) => {
        const features = Array.from({ length: featureCount }, (_, i) =>
            pointFeature(i, {}),
        );
        stubFetch([
            {
                ok: true,
                json: async () =>
                    featureCollection(features, { numberMatched }),
            },
        ]);

        const page = await fetchOgcFeaturesPage({
            url: COLLECTION_URL,
            offset,
            limit,
        });

        expect(page.totalFeatures).toBe(expected);
    });
});

describe("fetchOgcFeaturesPage — failures", () => {
    it("rejects with the HTTP status when the response is not ok", async () => {
        stubFetch([{ ok: false, status: 429, statusText: "Too Many Requests" }]);

        await expect(
            fetchOgcFeaturesPage({ url: COLLECTION_URL }),
        ).rejects.toThrow("OGC Features returned 429 Too Many Requests");
    });

    it.each([
        ["null body", null],
        ["non-object body", 42],
        ["body without features", { type: "FeatureCollection" }],
        ["features not an array", { features: "nope" }],
    ])("rejects when payload is %s", async (_name, payload) => {
        stubFetch([{ ok: true, json: async () => payload }]);

        await expect(
            fetchOgcFeaturesPage({ url: COLLECTION_URL }),
        ).rejects.toThrow(
            "OGC Features response is not a valid FeatureCollection",
        );
    });
});
