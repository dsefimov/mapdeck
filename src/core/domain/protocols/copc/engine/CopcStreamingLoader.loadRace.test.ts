/**
 * Race scenarios for CopcStreamingLoader._loadNode, driven against the real
 * settle sequence with the external world mocked: copc.js, initCopc, the
 * worker pool and the node extractor. The extraction phase is not reachable
 * by the abort signal — these tests pin the budget invariant around it
 * (the settle check is the last line of defense).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Bbox } from "@core/lib/geo";
import type { CachedNode } from "../types";
import { CopcStreamingLoader } from "./CopcStreamingLoader";

const { extractMock } = vi.hoisted(() => ({
    extractMock:
        vi.fn<(view: unknown, node: CachedNode) => Promise<void>>(),
}));

vi.mock("copc", () => ({
    Copc: { loadPointDataView: vi.fn(async () => ({})) },
    Hierarchy: {},
    Getter: () => {},
}));

vi.mock("./initialization/initCopc", () => ({
    initCopc: vi.fn(async () => ({
        copc: { header: { min: [-1, -1, -1], max: [1, 1, 1] }, wkt: null },
        resolvedSource: "fake-source",
        meta: {
            bounds: { minX: -1, minY: -1, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 },
            coordinateOrigin: [0, 0, 0],
            totalPoints: 1000,
            spacing: 1,
            spacingMeters: 1,
            hasColor: false,
            octreeCube: [-1, -1, -1, 1, 1, 1],
            rootHierarchyPage: { key: "0-0-0-0" },
        },
        transformer: null,
        needsTransform: false,
    })),
}));

vi.mock("./workers/WorkerPool", () => ({
    WorkerPool: class {
        constructor(..._args: unknown[]) {}
        dispose(): void {}
    },
}));

vi.mock("./extraction/NodeDataExtractor", () => ({
    NodeDataExtractor: class {
        extract = extractMock;
    },
}));

async function makeInitializedLoader(): Promise<CopcStreamingLoader> {
    const loader = new CopcStreamingLoader(
        "https://example.com/cloud.copc.laz",
        { maxConcurrentRequests: 2, maxOctreeDepth: 20 },
        Promise.resolve({} as never),
    );
    await loader.initialize();
    return loader;
}

function makeNode(pointCount = 100): CachedNode {
    const bounds = Bbox.fromCorners({
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 1,
        maxY: 1,
        maxZ: 1,
    });
    return {
        key: "0-0-0-0",
        keyArray: [0, 0, 0, 0],
        state: "pending",
        pointCount,
        pointDataOffset: 0,
        pointDataLength: 0,
        bounds,
        boundsWgs84: bounds,
    };
}

type LoadNodeFn = (node: CachedNode, signal: AbortSignal) => Promise<void>;

async function callLoadNode(
    loader: CopcStreamingLoader,
    node: CachedNode,
): Promise<void> {
    const internals = loader as unknown as { _loadNode: LoadNodeFn };
    // Bracket call stays bound to the loader and keeps the eslint
    // dangling-underscore rule quiet.
    await internals["_loadNode"](node, new AbortController().signal);
}

describe("CopcStreamingLoader._loadNode settle races", () => {
    beforeEach(() => {
        extractMock.mockReset();
    });

    it("discards the result when cancelled during extraction", async () => {
        const loader = await makeInitializedLoader();
        const node = makeNode(100);

        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        extractMock.mockImplementation(async (_view, n) => {
            n.positions = new Float32Array(3);
            await gate;
        });

        const pending = callLoadNode(loader, node);
        await vi.waitFor(() => expect(extractMock).toHaveBeenCalled());

        // What cancelStale does during the worker phase: the onAbort
        // callback refunds the budget and the state resets — the signal
        // itself cannot reach the extraction.
        node.state = "pending";
        release();

        await pending;
        expect(node.state).toBe("pending");
        expect(node.positions).toBeUndefined();
    });

    it("keeps the result when the load completes without cancellation", async () => {
        const loader = await makeInitializedLoader();
        const node = makeNode(100);

        extractMock.mockImplementation(async (_view, n) => {
            n.positions = new Float32Array([1, 2, 3]);
        });

        await callLoadNode(loader, node);

        expect(node.state).toBe("loaded");
        expect(node.positions).toBeDefined();
    });

    it("marks the node errored and retryable when extraction fails", async () => {
        const loader = await makeInitializedLoader();
        const node = makeNode(100);

        extractMock.mockRejectedValue(new Error("worker died"));

        await callLoadNode(loader, node);

        expect(node.state).toBe("error");
        expect(node.error).toBe("worker died");
        expect(node.retryAt).toBeGreaterThan(0);
    });
});
