import { describe, expect, it } from "vitest";
import {
    parseGeoJsonAdapterConfig,
    parseRasterAdapterConfig,
    parseVectorAdapterConfig,
} from "./adapterConfig";

describe("parseRasterAdapterConfig", () => {
    it("reads opacity and maxzoom with defaults", () => {
        expect(parseRasterAdapterConfig({})).toEqual({ opacity: 1 });
        expect(
            parseRasterAdapterConfig({ opacity: 0.5, maxzoom: 12 }),
        ).toEqual({ opacity: 0.5, maxzoom: 12 });
    });

    it("ignores unknown keys and non-positive maxzoom", () => {
        expect(
            parseRasterAdapterConfig({ opacity: 0.5, visible: false, maxzoom: 0 }),
        ).toEqual({ opacity: 0.5 });
    });

    it("throws on wrongly-typed values", () => {
        expect(() => parseRasterAdapterConfig({ opacity: "half" })).toThrow(
            /"opacity" must be a number/,
        );
        expect(() => parseRasterAdapterConfig(null)).toThrow(/must be an object/);
    });
});

describe("parseVectorAdapterConfig", () => {
    it("defaults layerType to fill and paint to empty", () => {
        expect(parseVectorAdapterConfig({})).toEqual({
            layerType: "fill",
            paint: {},
            opacity: 1,
        });
    });

    it("reads the full slice including symbol and source-layer", () => {
        expect(
            parseVectorAdapterConfig({
                layerType: "symbol",
                paint: { "text-color": "#123456" },
                opacity: 0.8,
                maxzoom: 10,
                sourceLayer: "countries",
            }),
        ).toEqual({
            layerType: "symbol",
            paint: { "text-color": "#123456" },
            opacity: 0.8,
            maxzoom: 10,
            sourceLayer: "countries",
        });
    });

    it("throws on an unknown layerType", () => {
        expect(() => parseVectorAdapterConfig({ layerType: "heatmap" })).toThrow(
            /"layerType"/,
        );
    });
});

describe("parseGeoJsonAdapterConfig", () => {
    it("reads layerType, paint and opacity", () => {
        expect(
            parseGeoJsonAdapterConfig({
                layerType: "line",
                paint: { "line-color": "red" },
                opacity: 0.3,
            }),
        ).toEqual({
            layerType: "line",
            paint: { "line-color": "red" },
            opacity: 0.3,
        });
    });
});
