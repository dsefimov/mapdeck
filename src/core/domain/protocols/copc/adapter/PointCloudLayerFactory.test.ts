import { describe, expect, it } from "vitest";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import type { PointCloudLayer } from "@deck.gl/layers";
import type { PointCloudData } from "@core/contracts";
import { Bbox } from "@core/lib/geo";
import { createPointCloudLayer } from "./PointCloudLayerFactory";

/** The shape the factory hands deck.gl — typed here so casts live in one place. */
interface LayerData {
    length: number;
    attributes: {
        getPosition: { value: Float32Array; size: number };
        getColor: { value: Uint8Array; size: number };
    };
}

function data(overrides: Partial<PointCloudData> = {}): PointCloudData {
    return {
        pointCount: 2,
        positions: Float32Array.from([1, 2, 3, 4, 5, 6]),
        colors: Uint8Array.from([10, 20, 30, 255, 40, 50, 60, 255]),
        coordinateOrigin: [11, 47, 0],
        bounds: Bbox.fromCorners({
            minX: 0,
            minY: 0,
            minZ: 0,
            maxX: 1,
            maxY: 1,
            maxZ: 1,
        }),
        ...overrides,
    };
}

describe("createPointCloudLayer", () => {
    it("builds an LNGLAT_OFFSETS layer anchored at the data's origin", () => {
        const layer = createPointCloudLayer("cloud", data(), {});

        expect(layer.id).toBe("cloud");
        expect(layer.props.coordinateSystem).toBe(
            COORDINATE_SYSTEM.LNGLAT_OFFSETS,
        );
        expect(layer.props.coordinateOrigin).toEqual([11, 47, 0]);
    });

    it("hands the positions over as a size-3 attribute on the point count", () => {
        const d = data();
        const layerData = createPointCloudLayer("cloud", d, {})
            .props.data as unknown as LayerData;

        expect(layerData.length).toBe(d.pointCount);
        expect(layerData.attributes.getPosition.value).toBe(d.positions);
        expect(layerData.attributes.getPosition.size).toBe(3);
    });

    it("passes precomputed colors straight through", () => {
        const d = data();
        const layerData = createPointCloudLayer("cloud", d, {})
            .props.data as unknown as LayerData;

        expect(layerData.attributes.getColor.value).toBe(d.colors);
        expect(layerData.attributes.getColor.size).toBe(4);
    });

    it("falls back to opaque white when colors are missing", () => {
        const d = data();
        delete d.colors;
        const layerData = createPointCloudLayer("cloud", d, {})
            .props.data as unknown as LayerData;

        expect(layerData.attributes.getColor.value).toHaveLength(8);
        expect([...layerData.attributes.getColor.value]).toEqual([
            255, 255, 255, 255, 255, 255, 255, 255,
        ]);
    });

    it.each([
        ["defaults to", {}, 2, 1],
        ["reads pointSize and opacity from config", { pointSize: 5, opacity: 0.4 }, 5, 0.4],
    ])("%s a fixed point size and opacity", (_case, config, size, opacity) => {
        const layer = createPointCloudLayer(
            "cloud",
            data(),
            config as Record<string, unknown>,
        ) as PointCloudLayer;

        expect(layer.props.pointSize).toBe(size);
        expect(layer.props.opacity).toBe(opacity);
    });

    it("keys position and color updates on the version counter", () => {
        const layer = createPointCloudLayer("cloud", data(), {}, 7);

        expect(layer.props.updateTriggers.getPosition).toEqual([7]);
        expect(layer.props.updateTriggers.getColor).toEqual([7]);
    });
});
