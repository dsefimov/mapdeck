import { describe, expect, it } from "vitest";
import type { CollectParams, Feature, LayerNode } from "@core/contracts";
import { createUnsupportedPlaceholderProvider } from "./unsupportedPlaceholders";

const node = (id: string, protocolId: string): LayerNode =>
    ({
        id,
        title: `Layer ${id}`,
        type: "layer",
        isVisible: true,
        renderer: { protocolId, sourceUrl: "https://x" },
        capabilities: [],
    }) as unknown as LayerNode;

const params = (visibleLayers: LayerNode[]): CollectParams =>
    ({ visibleLayers }) as unknown as CollectParams;

describe("createUnsupportedPlaceholderProvider", () => {
    it("placeholders exactly the layers whose protocol is not served", () => {
        const provider = createUnsupportedPlaceholderProvider(
            new Set(["wms", "vector-tile"]),
        );
        const features = provider.collect(
            params([
                node("a", "wms"),
                node("b", "xyz"),
                node("c", "cog"),
                node("d", "vector-tile"),
            ]),
        ) as Feature[];

        expect(features.map((f) => f.layerId)).toEqual(["b", "c"]);
        expect(features.every((f) => f.unsupported === true)).toBe(true);
        expect(features[0]).toMatchObject({
            id: "b_unsupported",
            layerName: "Layer b",
        });
    });

    it("empty when every visible layer is served", () => {
        const provider = createUnsupportedPlaceholderProvider(
            new Set(["xyz"]),
        );
        expect(provider.collect(params([node("a", "xyz")]))).toEqual([]);
    });

    it("empty with no visible layers", () => {
        expect(
            createUnsupportedPlaceholderProvider(new Set()).collect(params([])),
        ).toEqual([]);
    });
});
