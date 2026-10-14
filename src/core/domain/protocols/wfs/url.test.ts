import { describe, expect, it } from "vitest";
import type { WfsRequestParams } from "./types";
import {
    buildWfsUrl,
    detectVersion,
    setPaginationParams,
    setSortParams,
} from "./url";

function params(overrides: Partial<WfsRequestParams> = {}): WfsRequestParams {
    return {
        url: "https://wfs.example.test/service",
        startIndex: 0,
        maxFeatures: 50,
        ...overrides,
    };
}

describe("detectVersion", () => {
    it("defaults to 2.0.0", () => {
        expect(detectVersion(params({ version: undefined }))).toBe("2.0.0");
    });

    it("keeps an explicit version", () => {
        expect(detectVersion(params({ version: "1.1.0" }))).toBe("1.1.0");
    });
});

describe("setPaginationParams", () => {
    it("uses zero-based STARTINDEX and COUNT for WFS 2.x", () => {
        const qp = new URLSearchParams();
        setPaginationParams(qp, "2.0.0", 120, 50);
        expect(qp.get("STARTINDEX")).toBe("120");
        expect(qp.get("COUNT")).toBe("50");
    });

    it("uses zero-based STARTINDEX and MAXFEATURES for WFS 1.x", () => {
        const qp = new URLSearchParams();
        setPaginationParams(qp, "1.1.0", 0, 50);
        // Zero-based in every OGC generation: the first page starts at 0,
        // not 1 — a +1 here would silently skip the first feature.
        expect(qp.get("STARTINDEX")).toBe("0");
        expect(qp.get("MAXFEATURES")).toBe("50");
    });

    it("omits pagination entirely when both values are absent", () => {
        const qp = new URLSearchParams();
        setPaginationParams(qp, "2.0.0", undefined, undefined);
        expect(qp.get("STARTINDEX")).toBeNull();
        expect(qp.get("COUNT")).toBeNull();
    });
});

describe("setSortParams", () => {
    it("appends the ascending and descending suffixes", () => {
        const asc = new URLSearchParams();
        setSortParams(asc, "name", "asc");
        expect(asc.get("SORTBY")).toBe("name A");

        const desc = new URLSearchParams();
        setSortParams(desc, "name", "desc");
        expect(desc.get("SORTBY")).toBe("name D");
    });

    it("defaults to ascending without a direction", () => {
        const qp = new URLSearchParams();
        setSortParams(qp, "name", undefined);
        expect(qp.get("SORTBY")).toBe("name A");
    });
});

describe("buildWfsUrl", () => {
    it("sets the core GetFeature parameters", () => {
        const query = new URL(buildWfsUrl(params())).searchParams;
        expect(query.get("SERVICE")).toBe("WFS");
        expect(query.get("VERSION")).toBe("2.0.0");
        expect(query.get("REQUEST")).toBe("GetFeature");
        expect(query.get("OUTPUTFORMAT")).toBe("application/json");
    });

    it("adds optional parameters only when present", () => {
        const withAll = new URL(
            buildWfsUrl(
                params({ srsName: "EPSG:3857", cqlFilter: "type = 'road'" }),
            ),
        ).searchParams;
        expect(withAll.get("SRSNAME")).toBe("EPSG:3857");
        expect(withAll.get("CQL_FILTER")).toBe("type = 'road'");

        const bare = new URL(buildWfsUrl(params())).searchParams;
        expect(bare.get("SRSNAME")).toBeNull();
        expect(bare.get("CQL_FILTER")).toBeNull();
    });

    it("preserves existing endpoint query parameters", () => {
        const query = new URL(
            buildWfsUrl(
                params({ url: "https://wfs.example.test/s?map=lakes" }),
            ),
        ).searchParams;
        expect(query.get("map")).toBe("lakes");
        expect(query.get("SERVICE")).toBe("WFS");
    });

    it("rejects an unparseable endpoint", () => {
        expect(() =>
            buildWfsUrl(params({ url: "https://localhost:99999" })),
        ).toThrow(/Invalid WFS endpoint URL/);
    });

    it("resolves a document-relative endpoint against the document base", () => {
        const url = buildWfsUrl(params({ url: "/geoserver/main/wfs" }));
        const parsed = new URL(url);
        expect(parsed.pathname).toBe("/geoserver/main/wfs");
        expect(parsed.searchParams.get("SERVICE")).toBe("WFS");
    });
});
