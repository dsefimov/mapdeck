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

    it("commits the whole visible set on the first build", () => {
        const frame = new RenderBufferPool().build(
            [FIRST_KEY, SECOND_KEY],
            cacheOf(withPoints(FIRST_KEY, 3, 1), withPoints(SECOND_KEY, 2, 2)),
            ColorScheme.RGB,
            META,
        );

        expect(frame?.base?.pointCount).toBe(5);
        expect(frame?.base?.positions).toHaveLength(15);
        expect(frame?.incoming).toBeNull();
    });

    it("keeps the committed base by reference while only new nodes stream in", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 3, 1));

        const first = pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);
        cache.set(SECOND_KEY, withPoints(SECOND_KEY, 2, 2));
        const appended = pool.build(
            [FIRST_KEY, SECOND_KEY],
            cache,
            ColorScheme.RGB,
            META,
        );

        // Same envelope object — the renderer skips the base re-upload.
        expect(appended?.base).toBe(first?.base);
        expect(appended?.incoming?.pointCount).toBe(2);
        expect(appended?.incoming?.positions[0]).toBe(2);

        // The frozen base bytes survive the append untouched.
        expect(appended?.base?.positions[0]).toBe(1);
    });

    it("recommits when a committed node leaves the visible set", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(
            withPoints(FIRST_KEY, 2, 1),
            withPoints(SECOND_KEY, 2, 2),
        );

        const first = pool.build(
            [FIRST_KEY, SECOND_KEY],
            cache,
            ColorScheme.RGB,
            META,
        );
        const afterEviction = pool.build(
            [FIRST_KEY],
            cache,
            ColorScheme.RGB,
            META,
        );

        expect(afterEviction?.base).not.toBe(first?.base);
        expect(afterEviction?.base?.pointCount).toBe(2);
        expect(afterEviction?.incoming).toBeNull();
    });

    it("recommits when a committed node's buffers are replaced", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 2, 1));

        const first = pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);
        cache.set(FIRST_KEY, withPoints(FIRST_KEY, 2, 9));
        const reloaded = pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);

        expect(reloaded?.base).not.toBe(first?.base);
        expect(reloaded?.base?.positions[0]).toBe(9);
    });

    it("recommits on a scheme change — baked colors are per scheme", () => {
        const node = cachedNode(FIRST_KEY, {
            pointCount: 2,
            positions: new Float32Array(6).fill(7),
            colorsRgb: new Uint8Array(8).fill(10),
            colorsIntensity: new Uint8Array(8).fill(30),
        });
        const pool = new RenderBufferPool();
        const cache = cacheOf(node);

        const rgb = pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);
        const intensity = pool.build(
            [FIRST_KEY],
            cache,
            ColorScheme.INTENSITY,
            META,
        );

        expect(intensity?.base).not.toBe(rgb?.base);
        expect(intensity?.base?.colors?.[0]).toBe(30);
    });

    it("auto-commits once the incoming part rivals the base", () => {
        const pool = new RenderBufferPool();
        // base 500k → auto-commit above 125k incoming.
        const cache = cacheOf(withPoints(FIRST_KEY, 500_000, 1));
        pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);

        cache.set(SECOND_KEY, withPoints(SECOND_KEY, 130_000, 2));
        const appended = pool.build(
            [FIRST_KEY, SECOND_KEY],
            cache,
            ColorScheme.RGB,
            META,
        );

        expect(appended?.incoming).toBeNull();
        expect(appended?.base?.pointCount).toBe(630_000);

        // Below the threshold the incoming part is served as-is.
        cache.set("1-1-1-2", withPoints("1-1-1-2", 10_000, 3));
        const small = pool.build(
            [FIRST_KEY, SECOND_KEY, "1-1-1-2"],
            cache,
            ColorScheme.RGB,
            META,
        );
        expect(small?.incoming?.pointCount).toBe(10_000);
    });

    it("commit() folds everything visible and drops the incoming part", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 3, 1));

        pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);
        cache.set(SECOND_KEY, withPoints(SECOND_KEY, 2, 2));
        pool.build([FIRST_KEY, SECOND_KEY], cache, ColorScheme.RGB, META);

        const committed = pool.commit(
            [FIRST_KEY, SECOND_KEY],
            cache,
            ColorScheme.RGB,
            META,
        );

        expect(committed?.base?.pointCount).toBe(5);
        expect(committed?.incoming).toBeNull();

        // After the commit the same visible set has nothing incoming.
        const after = pool.build(
            [FIRST_KEY, SECOND_KEY],
            cache,
            ColorScheme.RGB,
            META,
        );
        expect(after?.base).toBe(committed?.base);
        expect(after?.incoming).toBeNull();
    });

    it("packs by key, so the visible-key order cannot shuffle the output", () => {
        const cache = cacheOf(
            withPoints(FIRST_KEY, 2, 1),
            withPoints(SECOND_KEY, 2, 2),
        );

        const frame = new RenderBufferPool().build(
            [SECOND_KEY, FIRST_KEY],
            cache,
            ColorScheme.RGB,
            META,
        );

        expect(frame?.base?.positions[0]).toBe(1);
        expect(frame?.base?.positions[6]).toBe(2);
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

        const frame = new RenderBufferPool().build(
            [FIRST_KEY],
            cacheOf(node),
            scheme,
            META,
        );

        expect(frame?.base?.colors?.[0]).toBe(expected);
    });

    it("skips a node that has not derived the active scheme's buffer yet", () => {
        const node = cachedNode(FIRST_KEY, {
            pointCount: 2,
            positions: new Float32Array(6).fill(7),
        });

        const frame = new RenderBufferPool().build(
            [FIRST_KEY],
            cacheOf(node),
            ColorScheme.ELEVATION,
            META,
        );

        expect(frame).toBeNull();
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

        const frame = new RenderBufferPool().build(
            [FIRST_KEY, SECOND_KEY],
            cacheOf(colored, notYetColored),
            ColorScheme.ELEVATION,
            META,
        );

        expect(frame?.base?.pointCount).toBe(2);
        expect(frame?.base?.colors?.[0]).toBe(20);
    });

    it("drops the committed snapshot when nothing is renderable", () => {
        const pool = new RenderBufferPool();
        const node = withPoints(FIRST_KEY, 3, 1);
        const cache = cacheOf(node);

        const first = pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);
        // The node loses its buffers — eviction, scheme switch, whatever.
        const heldPositions = node.positions!;
        delete node.positions;
        expect(
            pool.build([FIRST_KEY], cache, ColorScheme.RGB, META),
        ).toBeNull();

        // The very same reference back — a retained snapshot would serve
        // the old envelope, a dropped one commits fresh.
        node.positions = heldPositions;
        const after = pool.build(
            [FIRST_KEY],
            cache,
            ColorScheme.RGB,
            META,
        );
        expect(after?.base).not.toBe(first?.base);
    });
});

describe("RenderBufferPool capacity", () => {
    it("allocates exactly the first visible set", () => {
        const pool = new RenderBufferPool();

        pool.build(
            [FIRST_KEY],
            cacheOf(withPoints(FIRST_KEY, 3, 1)),
            ColorScheme.RGB,
            META,
        );

        expect(pool.capacity).toBe(3);
    });

    it("grows past the ask while doubling beats it", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 3, 1));

        pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);
        expect(pool.capacity).toBe(3);

        cache.set(SECOND_KEY, withPoints(SECOND_KEY, 2, 2));
        pool.commit([FIRST_KEY, SECOND_KEY], cache, ColorScheme.RGB, META);
        // Doubling (6) beats the ask (5) — the next append stays in-pool.
        expect(pool.capacity).toBe(6);
    });

    it("shrinks with headroom once usage falls to a quarter", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 4, 1));

        pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);
        expect(pool.capacity).toBe(4);

        // A recommit onto a lone 1-point node: 4 >= 1 * 4 → shrink to 2.
        cache.set(SECOND_KEY, withPoints(SECOND_KEY, 1, 2));
        pool.commit([SECOND_KEY], cache, ColorScheme.RGB, META);
        expect(pool.capacity).toBe(2);
    });

    it("holds the allocation inside the shrink band — a dive-back must not realloc", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 3, 1));

        pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);
        expect(pool.capacity).toBe(3);

        // 3 < 1 * 4: above the band, the allocation stays.
        cache.set(SECOND_KEY, withPoints(SECOND_KEY, 1, 2));
        pool.commit([SECOND_KEY], cache, ColorScheme.RGB, META);
        expect(pool.capacity).toBe(3);

        cache.set(FIRST_KEY, withPoints(FIRST_KEY, 3, 1));
        pool.commit([FIRST_KEY], cache, ColorScheme.RGB, META);
        expect(pool.capacity).toBe(3);
    });

    it("overwrites the previous frame's bytes in place — envelopes are valid until the next push", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 3, 1));

        const first = pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);
        cache.set(FIRST_KEY, withPoints(FIRST_KEY, 3, 9));
        pool.build([FIRST_KEY], cache, ColorScheme.RGB, META);

        // The old envelope views the same pool memory the recommit repacked.
        expect(first?.base?.positions[0]).toBe(9);
    });
});
