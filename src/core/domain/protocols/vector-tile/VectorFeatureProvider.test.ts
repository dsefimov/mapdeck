import { afterEach, describe, expect, it, vi } from "vitest";
import type maplibregl from "maplibre-gl";
import type { LayerSpecification } from "maplibre-gl";
import type { CollectParams, LayerNode } from "@core/contracts";
import { VectorFeatureProvider } from "./VectorFeatureProvider";

const VECTOR_TILE = "vector-tile";
const GEOJSON_TILED = "geojson-tiled";
const NATIVE = new Set([VECTOR_TILE, GEOJSON_TILED]);

function node(id: string, protocolId: string): LayerNode {
    return {
        id,
        title: id,
        renderer: { protocolId, sourceUrl: "https://x", params: {} },
    } as unknown as LayerNode;
}

function mapStub(renderedFeatureIds: string[]): maplibregl.Map {
    return {
        getLayer: (id: string) =>
            renderedFeatureIds.includes(id)
                ? ({ id } as LayerSpecification)
                : undefined,
        queryRenderedFeatures: vi.fn(() =>
            renderedFeatureIds.map((id) => ({
                layer: { id },
                properties: { name: `feat of ${id}` },
                id: `${id}-0`,
            })),
        ),
    } as unknown as maplibregl.Map;
}

function collectParams(
    map: maplibregl.Map,
    visibleLayers: LayerNode[],
): CollectParams {
    return {
        screenX: 10,
        screenY: 10,
        map,
        visibleLayers,
    } as CollectParams;
}

afterEach(() => vi.clearAllMocks());

describe("VectorFeatureProvider", () => {
    it("passes only native-protocol layer ids present in the style to the engine", async () => {
        const map = mapStub(["vt-1", "geo-1"]);
        const provider = new VectorFeatureProvider(NATIVE);

        await provider.collect(
            collectParams(map, [
                node("vt-1", VECTOR_TILE),
                node("geo-1", GEOJSON_TILED),
                node("wms-1", "wms"),
            ]),
        );

        expect(map.queryRenderedFeatures).toHaveBeenCalledWith([10, 10], {
            layers: ["vt-1", "geo-1"],
        });
    });

    it("skips ids whose maplibre layer has not landed yet", async () => {
        const map = mapStub(["vt-1"]);
        const provider = new VectorFeatureProvider(NATIVE);

        const features = await provider.collect(
            collectParams(map, [
                node("vt-1", VECTOR_TILE),
                node("vt-2", VECTOR_TILE),
            ]),
        );

        expect(map.queryRenderedFeatures).toHaveBeenCalledWith([10, 10], {
            layers: ["vt-1"],
        });
        expect(features).toHaveLength(1);
    });

    it("returns nothing when no visible layer is native", async () => {
        const map = mapStub(["vt-1"]);
        const provider = new VectorFeatureProvider(NATIVE);

        const features = await provider.collect(
            collectParams(map, [node("wms-1", "wms")]),
        );

        expect(features).toEqual([]);
        expect(map.queryRenderedFeatures).not.toHaveBeenCalled();
    });
});
