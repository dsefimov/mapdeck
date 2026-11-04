import { describe, expect, it, vi } from "vitest";
import { ColorScheme } from "@core/contracts";
import { cachedNode, TEST_BOUNDS } from "../__testFactories";
import type { WorkerPool } from "../workers/WorkerPool";
import type { ProcessResult } from "../workers/pointProcessing.types";
import { pickNodeColors } from "../render/schemeBuffers";
import { NodeDataExtractor } from "./NodeDataExtractor";

/** Pool stub: records the payload and answers with canned buffers. */
function fakePool() {
    return {
        post: vi.fn(
            async (
                payload: Record<string, unknown>,
                _transfer?: Transferable[],
                _priority?: number,
            ) => {
            const result: ProcessResult = {
                kind: "process",
                requestId: "r1",
                positions: new Float32Array(
                    (payload.pointCount as number) * 3,
                ),
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

const CTX_OVERRIDES = {
    wasmUrl: "laz-perf.wasm",
    pointDataRecordFormat: 6,
    pointDataRecordLength: 30,
    scale: [0.001, 0.001, 0.001] as [number, number, number],
    offset: [0, 0, 0] as [number, number, number],
    extraBytes: [],
};

function extractorWith(pool: unknown): NodeDataExtractor {
    return new NodeDataExtractor(pool as unknown as WorkerPool, {
        hasColor: false,
        needsTransform: false,
        wkt: null,
        coordinateOrigin: [0, 0, 0],
        bounds: TEST_BOUNDS,
        ...CTX_OVERRIDES,
    });
}

function nodeBytes(): Uint8Array {
    // Contents are opaque to the extractor — the worker decodes them.
    return new Uint8Array([9, 9, 9, 9]);
}

describe("NodeDataExtractor — the active scheme rides the job", () => {
    it("sends the compressed source and mapped scheme, and lands the buffer on the node", async () => {
        const pool = fakePool();
        const extractor = extractorWith(pool);
        const node = cachedNode("1-0-0-0", { state: "loading" });
        node.pointCount = 2;

        await extractor.extract(node, nodeBytes(), ColorScheme.INTENSITY);

        expect(pool.post.mock.calls[0]![0]).toMatchObject({
            activeScheme: "intensity",
            source: {
                wasmUrl: "laz-perf.wasm",
                pointDataRecordFormat: 6,
                pointCount: 2,
            },
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

        await extractor.extract(node, nodeBytes());

        expect(pool.post.mock.calls[0]![0]).toMatchObject({
            activeScheme: null,
        });
        expect(pickNodeColors(node, ColorScheme.INTENSITY)).toBeUndefined();
    });

    it("transfers the compressed bytes buffer", async () => {
        const pool = fakePool();
        const extractor = extractorWith(pool);
        const node = cachedNode("1-0-0-0", { state: "loading" });
        node.pointCount = 2;
        const bytes = nodeBytes();

        await extractor.extract(node, bytes, ColorScheme.RGB);

        expect(pool.post.mock.calls[0]![1]).toEqual([bytes.buffer]);
    });
});
