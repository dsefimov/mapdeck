import { describe, expect, it } from "vitest";
import type { GeoPoint } from "@core/lib/geo";
import type { MeasureColors } from "@core/ui/theme";
import type { Geometry, TechLayerSpec } from "../../types";
import { renderTechLayers } from "./techLayerRenderer";

const p = (lng: number, lat: number, z = 0): GeoPoint => ({ lng, lat, z });

const COLORS: MeasureColors = {
    stroke: [0, 81, 202, 200],
    fill: [0, 81, 202, 60],
    preview: [0, 81, 202, 150],
    css: { stroke: "#0051ca", fill: "#0051ca" },
};

const geometry = (kind: Geometry["kind"], points: GeoPoint[]): Geometry => ({
    id: "g1",
    kind,
    points,
});

describe("renderTechLayers", () => {
    it("renders path, points and preview layers for an active drawing", () => {
        const spec: TechLayerSpec = {
            geometries: [],
            drawing: geometry("polyline", [p(0, 0), p(1, 1)]),
            previewPoint: p(2, 2),
        };
        const layers = new Map(renderTechLayers("test", spec, COLORS));

        expect(layers.get("test-paths")).not.toBeNull();
        expect(layers.get("test-points")).not.toBeNull();
        expect(layers.get("test-preview-point")).not.toBeNull();
        expect(layers.get("test-preview-line")).not.toBeNull();
    });

    it("preview layers drop to null once the drawing is committed and cleared", () => {
        const spec: TechLayerSpec = {
            geometries: [geometry("polyline", [p(0, 0), p(1, 1)])],
            drawing: null,
            previewPoint: null,
        };
        const layers = new Map(renderTechLayers("test", spec, COLORS));

        expect(layers.get("test-preview-point")).toBeNull();
        expect(layers.get("test-preview-line")).toBeNull();
        expect(layers.get("test-paths")).not.toBeNull();
    });

    it("closes polygon rings and renders the polygon layer", () => {
        const spec: TechLayerSpec = {
            geometries: [geometry("polygon", [p(0, 0), p(1, 0), p(1, 1)])],
            drawing: null,
            previewPoint: null,
        };
        const layers = new Map(renderTechLayers("test", spec, COLORS));

        const polygon = layers.get("test-polygons") as unknown as {
            props: { data: [number, number, number][][] };
        };
        // The ring is closed: 3 points + the first repeated.
        expect(polygon.props.data[0]).toHaveLength(4);
    });

    it("injects the given colors — the renderer owns no theme", () => {
        const spec: TechLayerSpec = {
            geometries: [geometry("point", [p(0, 0)])],
            drawing: null,
            previewPoint: null,
        };
        const layers = new Map(renderTechLayers("test", spec, COLORS));
        const pointLayer = layers.get("test-points") as unknown as {
            props: { getFillColor: [number, number, number, number] };
        };
        expect(pointLayer.props.getFillColor).toEqual(COLORS.stroke);
    });

    it("an empty spec renders five null layers (full teardown)", () => {
        const spec: TechLayerSpec = {
            geometries: [],
            drawing: null,
            previewPoint: null,
        };
        const layers = renderTechLayers("test", spec, COLORS);
        expect(layers).toHaveLength(5);
        expect(layers.every(([, layer]) => layer === null)).toBe(true);
    });
});
