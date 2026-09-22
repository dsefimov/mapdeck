import { describe, expect, it } from "vitest";
import { ColorScheme } from "@core/contracts";
import type { CachedNode } from "../../types";
import type { WorkerPool } from "../workers/WorkerPool";
import type {
    RecolorRequest,
    RecolorResult,
} from "../workers/pointProcessing.types";
import { cachedNode, TEST_BOUNDS } from "../__testFactories";
import { pickNodeColors } from "../render/schemeBuffers";
import { SchemeColorizer } from "./SchemeColorizer";

const BOUNDS: [number, number, number, number, number, number] = [
    TEST_BOUNDS.minX,
    TEST_BOUNDS.minY,
    TEST_BOUNDS.minZ,
    TEST_BOUNDS.maxX,
    TEST_BOUNDS.maxY,
    TEST_BOUNDS.maxZ,
];

/** Records recolor requests and answers them with a canned color byte. */
class FakePool {
    readonly requests: RecolorRequest[] = [];
    readonly transfers: Transferable[][] = [];
    resultByte = 7;

    post(data: RecolorRequest, transfer: Transferable[]): Promise<RecolorResult> {
        this.requests.push(data);
        this.transfers.push(transfer);
        return Promise.resolve({
            kind: "recolor",
            requestId: data.requestId,
            colors: new Uint8Array(4).fill(this.resultByte),
        });
    }
}

function realHarness() {
    const pool = new FakePool();
    const colorizer = new SchemeColorizer(
        pool as unknown as WorkerPool,
        () => BOUNDS,
    );
    return { pool, colorizer };
}

function loadedNode(key: string): CachedNode {
    return cachedNode(key, {
        positions: Float32Array.from([1, 2, 100]),
        colorsRgb: Uint8Array.from([1, 2, 3, 4]),
        intensities: Float32Array.from([0.25]),
        classifications: Uint8Array.from([2]),
    });
}

describe("SchemeColorizer", () => {
    it("derives a missing scheme buffer through the pool and assigns it", async () => {
        const { pool, colorizer } = realHarness();
        const node = loadedNode("1-0-0-0");

        await colorizer.ensure(ColorScheme.INTENSITY, [node]);

        expect(pool.requests).toHaveLength(1);
        expect(pool.requests[0]?.kind).toBe("recolor");
        expect(pickNodeColors(node, ColorScheme.INTENSITY)?.[0]).toBe(7);
    });

    it("skips the default RGB scheme — it is computed at load time", async () => {
        const { pool, colorizer } = realHarness();
        const node = loadedNode("1-0-0-0");

        await colorizer.ensure(ColorScheme.RGB, [node]);

        expect(pool.requests).toHaveLength(0);
    });

    it.each([["pending"], ["loading"], ["error"]] as const)(
        "ignores a %s node",
        async (state) => {
            const { pool, colorizer } = realHarness();
            const node = cachedNode("1-0-0-0", { state });

            await colorizer.ensure(ColorScheme.INTENSITY, [node]);

            expect(pool.requests).toHaveLength(0);
            expect(pickNodeColors(node, ColorScheme.INTENSITY)).toBeUndefined();
        },
    );

    it("keeps an already-derived buffer instead of recomputing it", async () => {
        const { pool, colorizer } = realHarness();
        const node = loadedNode("1-0-0-0");
        node.colorsIntensity = Uint8Array.from([9, 9, 9, 9]);

        await colorizer.ensure(ColorScheme.INTENSITY, [node]);

        expect(pool.requests).toHaveLength(0);
        expect(pickNodeColors(node, ColorScheme.INTENSITY)?.[0]).toBe(9);
    });

    it("coalesces concurrent requests for the same node and scheme", async () => {
        const { pool, colorizer } = realHarness();
        const node = loadedNode("1-0-0-0");

        await Promise.all([
            colorizer.ensure(ColorScheme.ELEVATION, [node]),
            colorizer.ensure(ColorScheme.ELEVATION, [node]),
        ]);

        expect(pool.requests).toHaveLength(1);
    });

    it("sends copies of the source arrays, never the node's own buffers", async () => {
        const { pool, colorizer } = realHarness();
        const node = loadedNode("1-0-0-0");
        const intensities = node.intensities!;
        const classifications = node.classifications!;

        await colorizer.ensure(ColorScheme.CLASSIFICATION, [node]);

        const request = pool.requests[0]!;
        expect(request.classifications).not.toBe(classifications);
        expect(request.classifications![0]).toBe(classifications[0]);
        expect(intensities[0]).toBe(0.25);
        expect(request.heights![0]).toBe(100);
    });

    it("discards a result whose node was evicted while the job ran", async () => {
        const deferred = deferredPool();
        const node = loadedNode("1-0-0-0");

        const done = deferred.colorizer.ensure(ColorScheme.INTENSITY, [node]);
        node.state = "pending";
        delete node.positions;
        deferred.resolve(new Uint8Array(4).fill(7));
        await done;

        expect(pickNodeColors(node, ColorScheme.INTENSITY)).toBeUndefined();
    });

    it("discards a result whose node reloaded different data mid-flight", async () => {
        const deferred = deferredPool();
        const node = loadedNode("1-0-0-0");

        const done = deferred.colorizer.ensure(ColorScheme.INTENSITY, [node]);
        node.positions = new Float32Array([9, 9, 9]);
        deferred.resolve(new Uint8Array(4).fill(7));
        await done;

        expect(pickNodeColors(node, ColorScheme.INTENSITY)).toBeUndefined();
    });
});

/**
 * A colorizer over a pool whose answer is controlled by the test, so the
 * eviction/reload races can interleave with the in-flight job.
 */
function deferredPool() {
    let resolvePost: ((result: RecolorResult) => void) | null = null;
    const pool = {
        post: (_data: unknown, _transfer: Transferable[]) =>
            new Promise<RecolorResult>((resolve) => {
                resolvePost = resolve;
            }),
    };

    const colorizer = new SchemeColorizer(
        pool as unknown as ConstructorParameters<typeof SchemeColorizer>[0],
        () => null,
    );

    return {
        colorizer,
        resolve(colors: Uint8Array): void {
            resolvePost?.({ kind: "recolor", requestId: "x", colors });
        },
    };
}
