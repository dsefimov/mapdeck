import { describe, expect, it } from "vitest";

import { parseGeoJsonFeatures, parseGeoJsonResponse } from "./parser";

const FULL_PAGE = {
    type: "FeatureCollection",
    features: Array.from({ length: 500 }, (_, i) => ({
        type: "Feature",
        id: i,
        geometry: null,
        properties: { n: i },
    })),
};

const SHORT_PAGE = {
    type: "FeatureCollection",
    features: FULL_PAGE.features.slice(0, 37),
};

describe("parseGeoJsonFeatures — feature normalization", () => {
    it("keeps valid features and drops junk entries", () => {
        const result = parseGeoJsonFeatures({
            features: [
                {
                    type: "Feature",
                    id: 1,
                    geometry: { type: "Point", coordinates: [1, 2] },
                    properties: { a: 1 },
                },
                "junk",
                null,
                42,
                { type: "Feature", properties: null, geometry: null },
            ],
        });

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            id: "1",
            properties: { a: 1 },
            geometry: { type: "Point", coordinates: [1, 2] },
        });
        expect(result[1]).toEqual({
            id: "",
            properties: {},
            geometry: null,
        });
    });

    it("preserves the server's feature order", () => {
        const result = parseGeoJsonFeatures({
            features: [
                { type: "Feature", id: "b", properties: {}, geometry: null },
                { type: "Feature", id: "a", properties: {}, geometry: null },
            ],
        });

        expect(result.map((feature) => feature.id)).toEqual(["b", "a"]);
    });

    it.each([
        ["a numeric id", 7, "7"],
        ["a string id", "abc", "abc"],
        ["an absent id", undefined, ""],
    ])("normalizes %s to a string", (_case, id, expected) => {
        const result = parseGeoJsonFeatures({
            features: [{ type: "Feature", id, properties: {}, geometry: null }],
        });

        expect(result[0]?.id).toBe(expected);
    });

    it("returns an empty list for a non-array or absent features field", () => {
        expect(parseGeoJsonFeatures({ features: "nope" })).toEqual([]);
        expect(parseGeoJsonFeatures({})).toEqual([]);
    });
});

describe("parseGeoJsonResponse — features", () => {
    it("returns the normalized feature list with the page as the total", () => {
        const result = parseGeoJsonResponse({
            features: [
                { type: "Feature", id: 1, properties: { a: 1 }, geometry: null },
                "junk",
            ],
        });

        expect(result.features).toEqual([
            { id: "1", properties: { a: 1 }, geometry: null },
        ]);
        expect(result.totalFeatures).toBe(1);
    });

    it("keeps every feature of a full page end-to-end", () => {
        const result = parseGeoJsonResponse(
            { ...FULL_PAGE, numberMatched: 3000 },
            { pageSize: 500, offset: 0 },
        );

        expect(result.features).toHaveLength(500);
        expect(result.features[0]?.id).toBe("0");
        expect(result.features[499]?.id).toBe("499");
    });
});

describe("parseGeoJsonResponse — totals", () => {
    it("prefers a numeric numberMatched", () => {
        const result = parseGeoJsonResponse(
            { ...FULL_PAGE, numberMatched: 3000 },
            { pageSize: 500, offset: 0 },
        );
        expect(result.totalFeatures).toBe(3000);
    });

    it("coerces numeric-string numberMatched", () => {
        const result = parseGeoJsonResponse(
            { ...FULL_PAGE, numberMatched: "42" },
            {},
        );
        expect(result.totalFeatures).toBe(42);
    });

    it.each([
        ["absent", undefined],
        ["null", null],
        ["non-numeric", "many"],
    ])(
        "%s numberMatched on a full page at offset 500 fabricates 1001",
        (_case, matched) => {
            const result = parseGeoJsonResponse(
                { ...FULL_PAGE, numberMatched: matched },
                { pageSize: 500, offset: 500 },
            );
            // Regression: the estimate used to be offset-blind (`count + 1`),
            // collapsing the pager as soon as the second page was loaded.
            expect(result.totalFeatures).toBe(1001);
        },
    );

    it("totals offset+count on the short last page", () => {
        const result = parseGeoJsonResponse(SHORT_PAGE, {
            pageSize: 500,
            offset: 2500,
        });
        expect(result.totalFeatures).toBe(2537);
    });

    it("without pagination context counts only the page", () => {
        const result = parseGeoJsonResponse(SHORT_PAGE);
        expect(result.totalFeatures).toBe(37);
    });

    it("returns an empty response for non-object payloads", () => {
        expect(parseGeoJsonResponse(null)).toEqual({
            features: [],
            totalFeatures: 0,
        });
        expect(parseGeoJsonResponse(42)).toEqual({
            features: [],
            totalFeatures: 0,
        });
    });
});
