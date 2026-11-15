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
        vi.fn<(node: CachedNode, bytes: Uint8Array) => Promise<void>>(),
}));

vi.mock("copc", () => ({
    Hierarchy: {},
    Getter: () => {},
}));

vi.mock("./initialization/initCopc", () => ({
    initCopc: vi.fn(async () => ({
        copc: {
            header: {
                min: [-1, -1, -1],
                max: [1, 1, 1],
                pointDataRecordFormat: 0,
                pointDataRecordLength: 20,
                scale: [1, 1, 1],
                offset: [0, 0, 0],
            },
            wkt: null,
            eb: [],
        },
        // A real getter (not a URL string): createBoundedGetter passes
        // non-string sources through untouched, so node loads never touch
        // the network.
        resolvedSource: async () => new Uint8Array(8),
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
        "laz-perf.wasm",
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
        extractMock.mockImplementation(async (n) => {
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

        extractMock.mockImplementation(async (n) => {
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

describe("CopcStreamingLoader decoded-node LRU", () => {
    type LoaderWithEviction = {
        _eviction: {
            evictToBudget: (ctx: {
                totalPoints: number;
                targetPoints: number;
                currentFrame: number;
                viewportBounds: [number, number, number, number];
                nodeCache: ReadonlyMap<string, CachedNode>;
                errorKeys: Set<string>;
            }) => { freedPoints: number; evictedCount: number };
        };
        _nodeCache: Map<string, CachedNode>;
        _nodeLoader: { errorKeys: Set<string> };
    };

    beforeEach(() => {
        extractMock.mockReset();
    });

    it("restores an evicted node without a refetch or a decode", async () => {
        const loader = await makeInitializedLoader();
        const internals = loader as unknown as LoaderWithEviction;

        const node = makeNode(100);
        const buffers = new Float32Array(300);
        extractMock.mockImplementation(async (target) => {
            target.positions = buffers;
            target.colorsRgb = new Uint8Array(400);
            target.intensities = new Float32Array(100);
            target.classifications = new Uint8Array(100);
        });
        await callLoadNode(loader, node);
        // Bracket access keeps the eslint dangling-underscore rule quiet.
        const nodeCache = internals["_nodeCache"];
        const eviction = internals["_eviction"];
        nodeCache.set(node.key, node);
        // A stamp the current cycle did not leave: not a candidate.
        node.lastSeenAt = 0;

        const evicted = eviction.evictToBudget({
            totalPoints: 100,
            targetPoints: 0,
            currentFrame: 10,
            viewportBounds: [10, 10, 11, 11],
            nodeCache,
            errorKeys: internals["_nodeLoader"].errorKeys,
        });
        expect(evicted.evictedCount).toBe(1);
        expect(node.state).toBe("pending");
        expect(node.positions).toBeUndefined();

        // The zoom swings back — the reload must come from the cache:
        // no fetch through the source getter, no decode through the pool.
        extractMock.mockClear();
        await callLoadNode(loader, node);

        expect(node.state).toBe("loaded");
        expect(node.positions).toBe(buffers);
        expect(extractMock).not.toHaveBeenCalled();
    });
});
