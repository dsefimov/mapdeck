import { describe, expect, it } from "vitest";
import type { CachedNode } from "../../types";
import { cachedNode } from "../__testFactories";
import { clearTileData } from "./clearTileData";

const KEY = "1-0-0-0";
const NODE_POINTS = 100;

/** Every render array a loaded tile can be carrying. */
const RENDER_ARRAYS = [
    "positions",
    "colorsRgb",
    "colorsElevation",
    "colorsIntensity",
    "colorsClassification",
    "intensities",
    "classifications",
] as const;

function withRenderData(): CachedNode {
    return cachedNode(KEY, {
        pointCount: NODE_POINTS,
        positions: new Float32Array(3),
        colorsRgb: new Uint8Array(4),
        colorsElevation: new Uint8Array(4),
        colorsIntensity: new Uint8Array(4),
        colorsClassification: new Uint8Array(4),
        intensities: new Float32Array(1),
        classifications: new Uint8Array(1),
    });
}

describe("clearTileData", () => {
    it("returns the tile to the pending state, ready to be fetched again", () => {
        const node = withRenderData();

        clearTileData(node, new Set());

        expect(node.state).toBe("pending");
    });

    it("reports the points it freed, which is what the budget gets back", () => {
        expect(clearTileData(withRenderData(), new Set())).toBe(NODE_POINTS);
    });

    it.each(RENDER_ARRAYS)("drops the %s array", (field) => {
        const node = withRenderData();

        clearTileData(node, new Set());

        expect(node[field]).toBeUndefined();
    });

    it("forgets a past failure, so the tile is not held back by a stale error", () => {
        const errorKeys = new Set([KEY, "1-1-1-1"]);

        clearTileData(cachedNode(KEY), errorKeys);

        expect([...errorKeys]).toEqual(["1-1-1-1"]);
    });

    it("keeps the identity a reload needs — its key and its extent", () => {
        const node = withRenderData();

        clearTileData(node, new Set());

        expect(node.key).toBe(KEY);
        expect(node.bounds).toBeDefined();
        expect(node.pointCount).toBe(NODE_POINTS);
    });
});
