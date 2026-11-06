import { describe, expect, it } from "vitest";
import {
    tileToBbox,
    tileToQuadkey,
    getTilesForBounds,
    type TileCoord,
} from "./utils";

describe("tileToBbox", () => {
    it("maps the origin tile at zoom 0 to the whole world", () => {
        const [w, s, e, n] = tileToBbox([0, 0, 0]);

        expect(w).toBeCloseTo(-180, 6);
        expect(s).toBeCloseTo(-85.0511287798066, 6);
        expect(e).toBeCloseTo(180, 6);
        expect(n).toBeCloseTo(85.0511287798066, 6);
    });

    it("quarters the world at zoom 1", () => {
        const [w, s, e, n] = tileToBbox([1, 0, 1]);

        expect(w).toBeCloseTo(0, 6);
        expect(s).toBeCloseTo(0, 6);
        expect(e).toBeCloseTo(180, 6);
        expect(n).toBeCloseTo(85.0511287798066, 6);
    });

    it("round-trips: a tile's bbox covers the tile itself", () => {
        const tile: TileCoord = [3, 5, 3];
        const tiles = getTilesForBounds(tileToBbox(tile), 3);

        expect(tiles).toContainEqual(tile);
    });
});

describe("tileToQuadkey", () => {
    it("encodes the zoom-0 tile as the empty key", () => {
        expect(tileToQuadkey([0, 0, 0])).toBe("");
    });

    it("matches the Bing tile system example: tile (3, 5, 3) → \"213\"", () => {
        // The documented reference from Microsoft's Bing Maps Tile
        // System: tileX 3 = 011₂, tileY 5 = 101₂ → 100111₂ = 213₄.
        expect(tileToQuadkey([3, 5, 3])).toBe("213");
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

    it("yields the touched tile for a degenerate bbox on a tile boundary", () => {
        // (0, 0) is the shared corner of all four z1 tiles; the floor
        // side is the south-east quadrant.
        expect(getTilesForBounds([0, 0, 0, 0], 1)).toEqual([[1, 1, 1]]);
    });

    it("yields no tiles for an antimeridian-crossing box (west > east)", () => {
        expect(getTilesForBounds([170, -10, -170, 10], 1)).toEqual([]);
    });

    it("yields no tiles for a box entirely outside the world", () => {
        expect(getTilesForBounds([-200, -10, -190, 10], 3)).toEqual([]);
    });

    it("throws when the tile count would exceed the limit", () => {
        expect(() =>
            getTilesForBounds([-180, -85, 180, 85], 10, 100),
        ).toThrow(/exceed the limit/);
        expect(() =>
            getTilesForBounds([-180, -85, 180, 85], 10),
        ).toThrow(/exceed the limit/);
    });
});
