import { describe, expect, it, vi } from "vitest";
import type { View } from "copc";
import { ColorScheme } from "@core/contracts";
import { cachedNode, TEST_BOUNDS } from "../__testFactories";
import type { WorkerPool } from "../workers/WorkerPool";
import type { ProcessResult } from "../workers/pointProcessing.types";
import { pickNodeColors } from "../render/schemeBuffers";
import { NodeDataExtractor } from "./NodeDataExtractor";

/**
 * Minimal copc View stand-in: `getter(name)` returns a point indexer, the
 * only surface readRawLasFields touches.
 */
function fakeView(): View {
    const dims: Record<string, (i: number) => number> = {
        X: (i) => 10 + i,
        Y: (i) => 30 + i,
        Z: (i) => 100 + i,
        Intensity: (i) => 65535 - i,
        Classification: () => 2,
    };
    return {
        getter: (name: string) => dims[name]!,
    } as unknown as View;
}

/** Pool stub: records the payload and answers with canned buffers. */
function fakePool() {
    return {
        post: vi.fn(async (payload: Record<string, unknown>) => {
            const result: ProcessResult = {
                kind: "process",
                requestId: "r1",
                positions: new Float32Array(payload.pointCount as number * 3),
                colorsRgb: new Uint8Array(4),
                colorsActive: payload.activeScheme
                    ? new Uint8Array([7, 7, 7, 7])
                    : null,
                intensities: new Float32Array(payload.pointCount as number),
                classifications: new Uint8Array(payload.pointCount as number),
            };
            return result;
        }),
    };
}

function extractorWith(pool: unknown): NodeDataExtractor {
    return new NodeDataExtractor(pool as unknown as WorkerPool, {
        hasColor: false,
        needsTransform: false,
        wkt: null,
        coordinateOrigin: [0, 0, 0],
        bounds: TEST_BOUNDS,
    });
}

describe("NodeDataExtractor — the active scheme rides the job", () => {
    it("sends the mapped scheme in the payload and lands its buffer on the node", async () => {
        const pool = fakePool();
        const extractor = extractorWith(pool);
        const node = cachedNode("1-0-0-0", { state: "loading" });
        node.pointCount = 2;

        await extractor.extract(fakeView(), node, ColorScheme.INTENSITY);

        expect(pool.post.mock.calls[0]![0]).toMatchObject({
            activeScheme: "intensity",
        });
        expect(pickNodeColors(node, ColorScheme.INTENSITY)).toBeDefined();
        expect(node.positions).toBeDefined();
        expect(node.colorsRgb).toBeDefined();
    });

    it("keeps RGB without an active-scheme job", async () => {
        const pool = fakePool();
        const extractor = extractorWith(pool);
        const node = cachedNode("1-0-0-0", { state: "loading" });
        node.pointCount = 2;

        await extractor.extract(fakeView(), node);

        expect(pool.post.mock.calls[0]![0]).toMatchObject({
            activeScheme: null,
        });
        expect(pickNodeColors(node, ColorScheme.INTENSITY)).toBeUndefined();
    });
});
