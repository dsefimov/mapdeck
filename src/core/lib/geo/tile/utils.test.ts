import { describe, expect, it } from "vitest";
import { tileToBBOX, tileToQuadkey, getTilesForBounds } from "./utils";

describe("tileToBBOX", () => {
    it("maps the origin tile at zoom 0 to the whole world", () => {
        expect(tileToBBOX([0, 0, 0])).toEqual([-180, -85.0511287798066, 180, 85.0511287798066]);
    });

    it("quarters the world at zoom 1", () => {
        const [w, s, e, n] = tileToBBOX([1, 0, 1]);

        expect(w).toBeCloseTo(0, 6);
        expect(s).toBeCloseTo(0, 6);
        expect(e).toBeCloseTo(180, 6);
        expect(n).toBeCloseTo(85.0511287798066, 6);
    });
});

describe("tileToQuadkey", () => {
    it("encodes the zoom-0 tile as the empty key", () => {
        expect(tileToQuadkey([0, 0, 0])).toBe("");
    });

    it("encodes ancestry: a child's key starts with the parent's", () => {
        const parent = tileToQuadkey([1, 1, 1]);
        const child = tileToQuadkey([3, 2, 2]);

        expect(child.startsWith(parent)).toBe(true);
        expect(child.length).toBe(2);
    });
});

describe("getTilesForBounds", () => {
    it("covers a bounds straddling the tile edge with both tiles", () => {
        const tiles = getTilesForBounds([-0.5, 0, 1, 1], 1);

        expect(tiles).toContainEqual([0, 0, 1]);
        expect(tiles).toContainEqual([1, 0, 1]);
        expect(tiles.length).toBe(2);
    });

    it("keeps an edge-aligned bounds to its covering tile", () => {
        // west=0 is exactly the [1,0,1] tile's left edge — floor lands on 1.
        const tiles = getTilesForBounds([0, 0, 1, 1], 1);

        expect(tiles).toEqual([[1, 0, 1]]);
    });

    it("covers a wide bounds with every intersecting tile of the zoom", () => {
        const tiles = getTilesForBounds([-180, -85, 180, 85,], 1);

        expect(tiles).toHaveLength(4);
    });
});
