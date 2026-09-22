import { describe, expect, it } from "vitest";
import {
    setRasterOpacity,
    setPointSize,
    setColorScheme,
    setUniformVectorOpacity,
} from "./styleMutators";
import { layerStyle } from "./__testFactories";

const RASTER_OPACITY = "raster-opacity";
const NO_MUTATION = "does not mutate the original style";

describe("setRasterOpacity", () => {
    it("sets raster-opacity on a style with no paint", () => {
        const style = layerStyle();
        const result = setRasterOpacity(style, 0.5);
        expect(result.paint).toEqual({ [RASTER_OPACITY]: 0.5 });
    });

    it("overwrites existing raster-opacity", () => {
        const style = layerStyle({ paint: { [RASTER_OPACITY]: 1.0 } });
        const result = setRasterOpacity(style, 0.3);
        expect(result.paint).toEqual({ [RASTER_OPACITY]: 0.3 });
    });

    it("preserves other paint properties", () => {
        const style = layerStyle({ paint: { "other-prop": 42 } });
        const result = setRasterOpacity(style, 0.5);
        expect(result.paint).toEqual({
            [RASTER_OPACITY]: 0.5,
            "other-prop": 42,
        });
    });

    it("accepts zero opacity", () => {
        const style = layerStyle();
        const result = setRasterOpacity(style, 0);
        expect(result.paint).toEqual({ [RASTER_OPACITY]: 0 });
    });

    it("accepts negative opacity (no validation)", () => {
        const style = layerStyle();
        const result = setRasterOpacity(style, -0.5);
        expect(result.paint).toEqual({ [RASTER_OPACITY]: -0.5 });
    });

    it(NO_MUTATION, () => {
        const style = layerStyle({ paint: { [RASTER_OPACITY]: 1.0 } });
        setRasterOpacity(style, 0.5);
        expect(style.paint).toEqual({ [RASTER_OPACITY]: 1.0 });
    });

    it("preserves other top-level style fields", () => {
        const style = layerStyle({ type: "raster" as const, minzoom: 5 });
        const result = setRasterOpacity(style, 0.5);
        expect(result.type).toBe("raster");
        expect(result.minzoom).toBe(5);
        expect(result.paint).toEqual({ [RASTER_OPACITY]: 0.5 });
    });
});

describe("setPointSize", () => {
    it("sets circle-radius on a style with no paint", () => {
        const style = layerStyle();
        const result = setPointSize(style, 5);
        expect(result.paint).toEqual({ "circle-radius": 5 });
    });

    it("accepts zero point size (no validation)", () => {
        const style = layerStyle();
        const result = setPointSize(style, 0);
        expect(result.paint).toEqual({ "circle-radius": 0 });
    });

    it(NO_MUTATION, () => {
        const style = layerStyle();
        setPointSize(style, 10);
        expect(style.paint).toBeUndefined();
    });
});

describe("setColorScheme", () => {
    it("sets colorScheme in metadata on a style with no metadata", () => {
        const style = layerStyle();
        const result = setColorScheme(style, "viridis");
        expect(result.metadata).toEqual({ colorScheme: "viridis" });
    });

    it("overwrites existing colorScheme", () => {
        const style = layerStyle({ metadata: { colorScheme: "viridis" } });
        const result = setColorScheme(style, "plasma");
        expect(result.metadata).toEqual({ colorScheme: "plasma" });
    });

    it("preserves other metadata fields", () => {
        const style = layerStyle({ metadata: { other: 1 } });
        const result = setColorScheme(style, "viridis");
        expect(result.metadata).toEqual({ colorScheme: "viridis", other: 1 });
    });

    it(NO_MUTATION, () => {
        const style = layerStyle({ metadata: { colorScheme: "viridis" } });
        setColorScheme(style, "plasma");
        expect(style.metadata).toEqual({ colorScheme: "viridis" });
    });
});

describe("setUniformVectorOpacity", () => {
    it("writes the opacity into every vector paint channel at once", () => {
        const style = layerStyle();
        const result = setUniformVectorOpacity(style, 0.4);

        expect(result.paint).toEqual({
            "fill-opacity": 0.4,
            "line-opacity": 0.4,
            "circle-opacity": 0.4,
        });
    });

    it("overwrites disagreeing channels with one value", () => {
        const style = layerStyle({
            paint: { "fill-opacity": 1, "line-opacity": 0.2 },
        });
        const result = setUniformVectorOpacity(style, 0.6);

        expect(result.paint).toEqual({
            "fill-opacity": 0.6,
            "line-opacity": 0.6,
            "circle-opacity": 0.6,
        });
    });

    it("preserves other paint properties", () => {
        const style = layerStyle({ paint: { "fill-color": "#123456" } });
        const result = setUniformVectorOpacity(style, 0.5);

        expect(result.paint?.["fill-color"]).toBe("#123456");
    });

    it(NO_MUTATION, () => {
        const style = layerStyle({ paint: { "fill-opacity": 1 } });
        setUniformVectorOpacity(style, 0.2);
        expect(style.paint).toEqual({ "fill-opacity": 1 });
    });
});
