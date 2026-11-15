import { describe, expect, it } from "vitest";
import { VectorTileProtocol } from "./VectorTileProtocol";

const TILE_URL = "https://tiles.test/{z}/{x}/{y}.pbf";

describe("VectorTileProtocol.createRenderDescriptor", () => {
    const protocol = new VectorTileProtocol();

    it("defaults to a fill layer without source layer", () => {
        const d = protocol.createRenderDescriptor(TILE_URL);
        expect(d.config.layerType).toBe("fill");
        expect(d.config.sourceLayer).toBeUndefined();
    });

    it("takes source layer and layer type from params", () => {
        const d = protocol.createRenderDescriptor(
            TILE_URL,
            undefined,
            { sourceLayer: "water", layerType: "fill" },
        );
        expect(d.config.sourceLayer).toBe("water");
        expect(d.config.layerType).toBe("fill");
    });

    it("a node style outranks params for the layer type", () => {
        const d = protocol.createRenderDescriptor(
            TILE_URL,
            { type: "circle" },
            { layerType: "line" },
        );
        expect(d.config.layerType).toBe("circle");
    });

    it("params layer type wins when no style is given", () => {
        const d = protocol.createRenderDescriptor(
            TILE_URL,
            undefined,
            { layerType: "line" },
        );
        expect(d.config.layerType).toBe("line");
    });

    it.each(["nope", 7, null])("rejects a bogus layer type %p", (layerType) => {
        const d = protocol.createRenderDescriptor(
            TILE_URL,
            undefined,
            { layerType },
        );
        expect(d.config.layerType).toBe("fill");
    });
});
