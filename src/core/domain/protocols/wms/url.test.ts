import { describe, expect, it } from "vitest";
import { buildWmsFeatureInfoUrl, buildWmsTileUrl, wmsCrsKey } from "./url";

describe("wmsCrsKey — one versioning policy", () => {
    it.each([
        ["1.0.0", "SRS"],
        ["1.1.0", "SRS"],
        ["1.1.1", "SRS"],
        ["1.3.0", "CRS"],
        ["2.0.0", "CRS"],
    ])("%s speaks %s", (version, key) => {
        expect(wmsCrsKey(version)).toBe(key);
    });
});

describe("buildWmsTileUrl", () => {
    it("sends SRS alone on legacy versions", () => {
        const url = buildWmsTileUrl("https://w", "l", { version: "1.1.1" });
        expect(url).toContain("SRS=EPSG:3857");
        expect(url).not.toContain("CRS=");
    });

    it("sends CRS alone on 1.3.0+ and by default", () => {
        const v13 = buildWmsTileUrl("https://w", "l", { version: "1.3.0" });
        expect(v13).toContain("CRS=EPSG:3857");
        expect(v13).not.toContain("SRS=");

        const def = buildWmsTileUrl("https://w", "l");
        expect(def).toContain("CRS=EPSG:3857");
        expect(def).not.toContain("SRS=");
    });

    it("keeps the raw bbox template maplibre substitutes", () => {
        expect(buildWmsTileUrl("https://w", "l")).toContain(
            "BBOX={bbox-epsg-3857}",
        );
    });
});

describe("buildWmsFeatureInfoUrl", () => {
    it("carries the query layers and the JSON info format", () => {
        const url = buildWmsFeatureInfoUrl("https://w", "roads");
        expect(url).toContain("QUERY_LAYERS=roads");
        expect(url).toContain("INFO_FORMAT=application%2Fjson");
    });
});
