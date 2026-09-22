import { describe, expect, it } from "vitest";
import { ColorScheme } from "@core/contracts";
import type { CachedNode } from "../../types";
import { TEST_BOUNDS, cachedNode } from "../__testFactories";
import { RenderBufferPool, type RenderOutputMeta } from "./RenderBufferPool";

const META: RenderOutputMeta = {
    coordinateOrigin: [0, 0, 0],
    bounds: TEST_BOUNDS,
};

const FIRST_KEY = "1-0-0-0";
const SECOND_KEY = "1-1-1-1";

function withPoints(key: string, pointCount: number, fill: number): CachedNode {
    return cachedNode(key, {
        pointCount,
        positions: new Float32Array(pointCount * 3).fill(fill),
        colorsRgb: new Uint8Array(pointCount * 4).fill(fill),
    });
}

function cacheOf(...nodes: CachedNode[]): Map<string, CachedNode> {
    return new Map(nodes.map((node) => [node.key, node]));
}

describe("RenderBufferPool", () => {
    it("returns nothing when no visible node carries point data", () => {
        const cache = cacheOf(cachedNode(FIRST_KEY));

        expect(
            new RenderBufferPool().build(
                [FIRST_KEY],
                cache,
                ColorScheme.RGB,
                META,
            ),
        ).toBeNull();
    });

    it("shrinks the allocation once usage falls to a quarter of it", () => {
        const pool = new RenderBufferPool();
        pool.build([FIRST_KEY], cacheOf(withPoints(FIRST_KEY, 400, 1)), ColorScheme.RGB, META);
        expect(pool.capacity).toBe(400);

        pool.build([FIRST_KEY], cacheOf(withPoints(FIRST_KEY, 90, 1)), ColorScheme.RGB, META);

        // 90 ≤ 400/4 — shrunk to double headroom above usage.
        expect(pool.capacity).toBe(180);
    });

    it("keeps the allocation when usage is still above the shrink band", () => {
        const pool = new RenderBufferPool();
        pool.build([FIRST_KEY], cacheOf(withPoints(FIRST_KEY, 400, 1)), ColorScheme.RGB, META);

        pool.build([FIRST_KEY], cacheOf(withPoints(FIRST_KEY, 150, 1)), ColorScheme.RGB, META);

        // 150 > 400/4 — no shrink, no churn on ordinary view changes.
        expect(pool.capacity).toBe(400);
    });

    it("a shrunk pool still packs a full dive back in", () => {
        const pool = new RenderBufferPool();
        pool.build([FIRST_KEY], cacheOf(withPoints(FIRST_KEY, 400, 1)), ColorScheme.RGB, META);
        pool.build([FIRST_KEY], cacheOf(withPoints(FIRST_KEY, 50, 1)), ColorScheme.RGB, META);
        expect(pool.capacity).toBe(100);

        const data = pool.build(
            [FIRST_KEY],
            cacheOf(withPoints(FIRST_KEY, 350, 7)),
            ColorScheme.RGB,
            META,
        );

        expect(data?.pointCount).toBe(350);
        expect(data?.positions).toHaveLength(350 * 3);
        expect(data?.positions[0]).toBe(7);
    });

    it("packs every visible node into one contiguous pair of buffers", () => {
        const cache = cacheOf(
            withPoints(FIRST_KEY, 3, 1),
            withPoints(SECOND_KEY, 2, 2),
        );

        const data = new RenderBufferPool().build(
            [FIRST_KEY, SECOND_KEY],
            cache,
            ColorScheme.RGB,
            META,
        );

        expect(data?.pointCount).toBe(5);
        expect(data?.positions).toHaveLength(15);
        expect(data?.colors).toHaveLength(20);
    });

    it("packs by key, so the visible-key order cannot shuffle the output", () => {
        const cache = cacheOf(
            withPoints(FIRST_KEY, 2, 1),
            withPoints(SECOND_KEY, 2, 2),
        );

        const data = new RenderBufferPool().build(
            [SECOND_KEY, FIRST_KEY],
            cache,
            ColorScheme.RGB,
            META,
        );

        expect(data?.positions[0]).toBe(1);
        expect(data?.positions[6]).toBe(2);
    });

    it("reuses the allocation for a smaller frame and grows for a larger one", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(
            withPoints(FIRST_KEY, 100, 1),
            withPoints(SECOND_KEY, 500, 2),
        );

        const grown = pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);
        const shrunk = pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);
        const regrown = pool.build([SECOND_KEY], cache, ColorScheme.RGB, META);

        expect(shrunk?.positions.buffer).toBe(grown?.positions.buffer);
        expect(regrown?.positions.buffer).not.toBe(grown?.positions.buffer);
    });

    it("hands out views into the pool, so the previous frame's data is overwritten", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(
            withPoints(FIRST_KEY, 2, 1),
            withPoints(SECOND_KEY, 2, 2),
        );

        const first = pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);
        pool.build([SECOND_KEY], cache, ColorScheme.RGB, META);

        expect(first?.positions[0]).toBe(2);
    });

    it.each<[ColorScheme, number]>([
        [ColorScheme.RGB, 10],
        [ColorScheme.ELEVATION, 20],
        [ColorScheme.INTENSITY, 30],
        [ColorScheme.CLASSIFICATION, 40],
    ])("colors the points from the %s arrays", (scheme, expected) => {
        const node = cachedNode(FIRST_KEY, {
            pointCount: 2,
            positions: new Float32Array(6),
            colorsRgb: new Uint8Array(8).fill(10),
            colorsElevation: new Uint8Array(8).fill(20),
            colorsIntensity: new Uint8Array(8).fill(30),
            colorsClassification: new Uint8Array(8).fill(40),
        });

        const data = new RenderBufferPool().build(
            [FIRST_KEY],
            cacheOf(node),
            scheme,
            META,
        );

        expect(data?.colors?.[0]).toBe(expected);
    });

    it("skips a node that has not derived the active scheme's buffer yet", () => {
        const node = cachedNode(FIRST_KEY, {
            pointCount: 2,
            positions: new Float32Array(6).fill(7),
        });

        const data = new RenderBufferPool().build(
            [FIRST_KEY],
            cacheOf(node),
            ColorScheme.ELEVATION,
            META,
        );

        expect(data).toBeNull();
    });

    it("packs only the nodes holding the active scheme's buffer in a mixed set", () => {
        const colored = cachedNode(FIRST_KEY, {
            pointCount: 2,
            positions: Float32Array.from([1, 1, 1, 1, 1, 1]),
            colorsElevation: Uint8Array.from([20, 20, 20, 20, 20, 20, 20, 20]),
        });
        const notYetColored = cachedNode(SECOND_KEY, {
            pointCount: 3,
            positions: new Float32Array(9),
        });

        const data = new RenderBufferPool().build(
            [FIRST_KEY, SECOND_KEY],
            cacheOf(colored, notYetColored),
            ColorScheme.ELEVATION,
            META,
        );

        expect(data?.pointCount).toBe(2);
        expect(data?.colors?.[0]).toBe(20);
    });
});
