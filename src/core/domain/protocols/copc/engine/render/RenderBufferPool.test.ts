import { describe, expect, it } from "vitest";
import { ColorScheme } from "@core/contracts";
import type { PointCloudData } from "@core/contracts";
import type { CachedNode } from "../../types";
import { TEST_BOUNDS, cachedNode } from "../__testFactories";
import {
    RenderBufferPool,
    type PackContext,
    type RenderOutputMeta,
} from "./RenderBufferPool";

const META: RenderOutputMeta = {
    coordinateOrigin: [0, 0, 0],
    bounds: TEST_BOUNDS,
};

const NO_HIDDEN: ReadonlySet<number> = new Set();

/** Pack context for the common call shape — scheme, optional filter. */
function packCtx(
    scheme: ColorScheme = ColorScheme.RGB,
    hidden: ReadonlySet<number> = NO_HIDDEN,
): PackContext {
    return { scheme, meta: META, hidden };
}

const FIRST_KEY = "1-0-0-0";
const SECOND_KEY = "1-1-1-1";

function withPoints(key: string, pointCount: number, fill: number): CachedNode {
    return cachedNode(key, {
        pointCount,
        positions: new Float32Array(pointCount * 3).fill(fill),
        colorsRgb: new Uint8Array(pointCount * 4).fill(fill),
    });
}

/** One class per point, x carrying the class for assertions. */
function withClasses(key: string, codes: number[]): CachedNode {
    const n = codes.length;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) positions[i * 3] = codes[i]!;
    return cachedNode(key, {
        pointCount: n,
        positions,
        colorsRgb: new Uint8Array(n * 4).fill(9),
        classifications: Uint8Array.from(codes),
    });
}

function cacheOf(...nodes: CachedNode[]): Map<string, CachedNode> {
    return new Map(nodes.map((node) => [node.key, node]));
}

/** The committed base, asserted present — keeps optional chains out of the tests. */
function baseOf(frame: { base: unknown } | null): unknown {
    expect(frame?.base).toBeDefined();
    return frame!.base;
}

describe("RenderBufferPool", () => {
    it("returns nothing when no visible node carries point data", () => {
        const cache = cacheOf(cachedNode(FIRST_KEY));

        expect(
            new RenderBufferPool().build([FIRST_KEY], cache, packCtx()),
        ).toBeNull();
    });

    it("commits the whole visible set on the first build", () => {
        const frame = new RenderBufferPool().build(
            [FIRST_KEY, SECOND_KEY],
            cacheOf(withPoints(FIRST_KEY, 3, 1), withPoints(SECOND_KEY, 2, 2)),
            packCtx(),
        );

        expect(frame?.base?.pointCount).toBe(5);
        expect(frame?.base?.positions).toHaveLength(15);
        expect(frame?.incoming).toBeNull();
    });

    it("keeps the committed base by reference while only new nodes stream in", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 3, 1));

        const first = pool.build([FIRST_KEY], cache, packCtx());
        cache.set(SECOND_KEY, withPoints(SECOND_KEY, 2, 2));
        const appended = pool.build(
            [FIRST_KEY, SECOND_KEY],
            cache,
            packCtx(),
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

        const first = pool.build([FIRST_KEY, SECOND_KEY], cache, packCtx());
        const afterEviction = pool.build([FIRST_KEY], cache, packCtx());

        expect(afterEviction?.base).not.toBe(first?.base);
        expect(afterEviction?.base?.pointCount).toBe(2);
        expect(afterEviction?.incoming).toBeNull();
    });

    it("recommits when a committed node's buffers are replaced", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 2, 1));

        const first = pool.build([FIRST_KEY], cache, packCtx());
        cache.set(FIRST_KEY, withPoints(FIRST_KEY, 2, 9));
        const reloaded = pool.build([FIRST_KEY], cache, packCtx());

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

        const rgb = pool.build([FIRST_KEY], cache, packCtx());
        const intensity = pool.build(
            [FIRST_KEY],
            cache,
            packCtx(ColorScheme.INTENSITY),
        );

        expect(intensity?.base).not.toBe(rgb?.base);
        expect(intensity?.base?.colors?.[0]).toBe(30);
    });

    it("auto-commits once the incoming part rivals the base", () => {
        const pool = new RenderBufferPool();
        // base 500k → auto-commit above 125k incoming.
        const cache = cacheOf(withPoints(FIRST_KEY, 500_000, 1));
        pool.build([FIRST_KEY], cache, packCtx());

        cache.set(SECOND_KEY, withPoints(SECOND_KEY, 130_000, 2));
        const appended = pool.build(
            [FIRST_KEY, SECOND_KEY],
            cache,
            packCtx(),
        );

        expect(appended?.incoming).toBeNull();
        expect(appended?.base?.pointCount).toBe(630_000);

        // Below the threshold the incoming part is served as-is.
        cache.set("1-1-1-2", withPoints("1-1-1-2", 10_000, 3));
        const small = pool.build(
            [FIRST_KEY, SECOND_KEY, "1-1-1-2"],
            cache,
            packCtx(),
        );
        expect(small?.incoming?.pointCount).toBe(10_000);
    });

    it("commit() folds everything visible and drops the incoming part", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 3, 1));

        pool.build([FIRST_KEY], cache, packCtx());
        cache.set(SECOND_KEY, withPoints(SECOND_KEY, 2, 2));
        pool.build([FIRST_KEY, SECOND_KEY], cache, packCtx());

        const committed = pool.commit([FIRST_KEY, SECOND_KEY], cache, packCtx());

        expect(committed?.base?.pointCount).toBe(5);
        expect(committed?.incoming).toBeNull();

        // After the commit the same visible set has nothing incoming.
        const after = pool.build([FIRST_KEY, SECOND_KEY], cache, packCtx());
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
            packCtx(),
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
            packCtx(scheme),
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
            packCtx(ColorScheme.ELEVATION),
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
            packCtx(ColorScheme.ELEVATION),
        );

        expect(frame?.base?.pointCount).toBe(2);
        expect(frame?.base?.colors?.[0]).toBe(20);
    });

    it("drops the committed snapshot when nothing is renderable", () => {
        const pool = new RenderBufferPool();
        const node = withPoints(FIRST_KEY, 3, 1);
        const cache = cacheOf(node);

        const first = pool.build([FIRST_KEY], cache, packCtx());
        // The node loses its buffers — eviction, scheme switch, whatever.
        const heldPositions = node.positions!;
        delete node.positions;
        expect(pool.build([FIRST_KEY], cache, packCtx())).toBeNull();

        // The very same reference back — a retained snapshot would serve
        // the old envelope, a dropped one commits fresh.
        node.positions = heldPositions;
        const after = pool.build([FIRST_KEY], cache, packCtx());
        expect(after?.base).not.toBe(first?.base);
    });

    it("packs per-point classifications into the envelope", () => {
        const frame = new RenderBufferPool().build(
            [FIRST_KEY],
            cacheOf(withClasses(FIRST_KEY, [2, 6, 2])),
            packCtx(),
        );

        expect([...(frame?.base?.classifications ?? [])]).toEqual([2, 6, 2]);
    });

    it("packs absent classification channels as code 0", () => {
        const pool = new RenderBufferPool();
        // A previous, larger pack left stale bytes — the zero fill must
        // overwrite them, not leak classes from the earlier frame.
        pool.build(
            [FIRST_KEY],
            cacheOf(withClasses(FIRST_KEY, [7, 7, 7])),
            packCtx(),
        );

        const frame = pool.build(
            [FIRST_KEY],
            cacheOf(withPoints(FIRST_KEY, 2, 1)),
            packCtx(),
        );

        expect([...(frame?.base?.classifications ?? [])]).toEqual([0, 0]);
    });

    it("drops hidden classes from every packed array", () => {
        const frame = new RenderBufferPool().build(
            [FIRST_KEY],
            cacheOf(withClasses(FIRST_KEY, [2, 6, 2, 18])),
            packCtx(ColorScheme.RGB, new Set([6, 18])),
        );

        expect(frame?.base?.pointCount).toBe(2);
        // Surviving points keep their positions (class as x) in order…
        const positions = frame?.base?.positions ?? new Float32Array();
        expect([positions[0], positions[3]]).toEqual([2, 2]);
        // …and their classification bytes compact alongside them.
        expect([...(frame?.base?.classifications ?? [])]).toEqual([2, 2]);
    });

    it("recommits when the hidden set changes — kept points are baked per filter", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withClasses(FIRST_KEY, [2, 6]));
        const hidden = new Set([6]);

        const unfiltered = pool.build([FIRST_KEY], cache, packCtx());
        const filtered = pool.build(
            [FIRST_KEY],
            cache,
            packCtx(ColorScheme.RGB, hidden),
        );

        const base = baseOf(filtered) as PointCloudData;
        expect(base).not.toBe(unfiltered?.base);
        expect(base.pointCount).toBe(1);
        expect(base.classifications?.[0]).toBe(2);

        // The pool keys on the set's identity, not its content: the same
        // instance keeps the envelope, a content-equal fresh one recommits.
        // Keeping same-content sets from ever reaching the pool (one
        // instance per filter value) is the loader's job.
        const sameInstance = pool.build(
            [FIRST_KEY],
            cache,
            packCtx(ColorScheme.RGB, hidden),
        );
        expect(baseOf(sameInstance)).toBe(base);

        const freshInstance = pool.build(
            [FIRST_KEY],
            cache,
            packCtx(ColorScheme.RGB, new Set([6])),
        );
        expect(baseOf(freshInstance)).not.toBe(base);
    });

    it("packs an empty envelope when every class is hidden", () => {
        const frame = new RenderBufferPool().build(
            [FIRST_KEY],
            cacheOf(withClasses(FIRST_KEY, [2, 6])),
            packCtx(ColorScheme.RGB, new Set([2, 6])),
        );

        expect(frame?.base?.pointCount).toBe(0);
        expect(frame?.base?.positions).toHaveLength(0);
        expect(frame?.base?.classifications).toHaveLength(0);
    });

    it("packs the incoming part under the same filter as the base", () => {
        const pool = new RenderBufferPool();
        const hidden = new Set([6]);
        const cache = cacheOf(withClasses(FIRST_KEY, [2, 2]));
        pool.build([FIRST_KEY], cache, packCtx(ColorScheme.RGB, hidden));

        cache.set(SECOND_KEY, withClasses(SECOND_KEY, [2, 6, 6]));
        const frame = pool.build(
            [FIRST_KEY, SECOND_KEY],
            cache,
            packCtx(ColorScheme.RGB, hidden),
        );

        expect(frame?.incoming?.pointCount).toBe(1);
        expect([...(frame?.incoming?.classifications ?? [])]).toEqual([2]);
    });

    it("serves a fully hidden incoming part as null, not an empty envelope", () => {
        const pool = new RenderBufferPool();
        const hidden = new Set([6]);
        const cache = cacheOf(withClasses(FIRST_KEY, [2, 2]));
        const committed = pool.build(
            [FIRST_KEY],
            cache,
            packCtx(ColorScheme.RGB, hidden),
        );

        cache.set(SECOND_KEY, withClasses(SECOND_KEY, [6, 6]));
        const frame = pool.build(
            [FIRST_KEY, SECOND_KEY],
            cache,
            packCtx(ColorScheme.RGB, hidden),
        );

        // An empty envelope would make the adapter push a length-0 deck
        // layer on every progress frame.
        expect(frame?.incoming).toBeNull();
        expect(frame?.base).toBe(committed?.base);
    });
});

describe("RenderBufferPool capacity", () => {
    it("allocates exactly the first visible set", () => {
        const pool = new RenderBufferPool();

        pool.build(
            [FIRST_KEY],
            cacheOf(withPoints(FIRST_KEY, 3, 1)),
            packCtx(),
        );

        expect(pool.capacity).toBe(3);
    });

    it("grows past the ask while doubling beats it", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 3, 1));

        pool.build([FIRST_KEY], cache, packCtx());
        expect(pool.capacity).toBe(3);

        cache.set(SECOND_KEY, withPoints(SECOND_KEY, 2, 2));
        pool.commit([FIRST_KEY, SECOND_KEY], cache, packCtx());
        // Doubling (6) beats the ask (5) — the next append stays in-pool.
        expect(pool.capacity).toBe(6);
    });

    it("shrinks with headroom once usage falls to a quarter", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 4, 1));

        pool.build([FIRST_KEY], cache, packCtx());
        expect(pool.capacity).toBe(4);

        // A recommit onto a lone 1-point node: 4 >= 1 * 4 → shrink to 2.
        cache.set(SECOND_KEY, withPoints(SECOND_KEY, 1, 2));
        pool.commit([SECOND_KEY], cache, packCtx());
        expect(pool.capacity).toBe(2);
    });

    it("holds the allocation inside the shrink band — a dive-back must not realloc", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 3, 1));

        pool.build([FIRST_KEY], cache, packCtx());
        expect(pool.capacity).toBe(3);

        // 3 < 1 * 4: above the band, the allocation stays.
        cache.set(SECOND_KEY, withPoints(SECOND_KEY, 1, 2));
        pool.commit([SECOND_KEY], cache, packCtx());
        expect(pool.capacity).toBe(3);

        cache.set(FIRST_KEY, withPoints(FIRST_KEY, 3, 1));
        pool.commit([FIRST_KEY], cache, packCtx());
        expect(pool.capacity).toBe(3);
    });

    it("overwrites the previous frame's bytes in place — envelopes are valid until the next push", () => {
        const pool = new RenderBufferPool();
        const cache = cacheOf(withPoints(FIRST_KEY, 3, 1));

        const first = pool.build([FIRST_KEY], cache, packCtx());
        cache.set(FIRST_KEY, withPoints(FIRST_KEY, 3, 9));
        pool.build([FIRST_KEY], cache, packCtx());

        // The old envelope views the same pool memory the recommit repacked.
        expect(first?.base?.positions[0]).toBe(9);
    });
});
