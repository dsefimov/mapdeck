/**
 * Orchestration contract of CopcStreamingLoader: initialization lifecycle,
 * scheme switching (stale-generation guard, background chunked recolor),
 * load-error budget refund, and teardown. The external world is mocked —
 * copc.js, initCopc, the worker pool, the node extractor and the scheme
 * colorizer; the loadRace suite covers the _loadNode settle sequence itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Bbox } from "@core/lib/geo";
import { ColorScheme } from "@core/contracts";
import type { CachedNode } from "../types";
import type { CameraSnapshot } from "./geometry";
import type { CycleState } from "./cycle/CycleExecutor";
import { CopcStreamingLoader } from "./CopcStreamingLoader";

const { initCopcMock, loadPointDataViewMock, extractMock, ensureMock, disposeMock } =
    vi.hoisted(() => ({
        initCopcMock: vi.fn<() => Promise<unknown>>(),
        loadPointDataViewMock: vi.fn<() => Promise<unknown>>(),
        extractMock: vi.fn<(view: unknown, node: CachedNode) => Promise<void>>(),
        ensureMock: vi.fn<(scheme: unknown, nodes: unknown[]) => Promise<void>>(),
        disposeMock: vi.fn<() => void>(),
    }));

vi.mock("copc", () => ({
    Copc: { loadPointDataView: loadPointDataViewMock },
    Hierarchy: {},
    Getter: () => {},
}));

const INIT_FIXTURE = {
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
};

vi.mock("./initialization/initCopc", () => ({
    initCopc: initCopcMock,
}));

vi.mock("./workers/WorkerPool", () => ({
    WorkerPool: class {
        constructor(..._args: unknown[]) {}
        dispose = disposeMock;
    },
}));

vi.mock("./extraction/NodeDataExtractor", () => ({
    NodeDataExtractor: class {
        extract = extractMock;
    },
}));

vi.mock("./recolor/SchemeColorizer", () => ({
    SchemeColorizer: class {
        constructor(..._args: unknown[]) {}
        ensure = ensureMock;
    },
}));

interface LoaderInternals {
    _cycleState: CycleState;
    _nodeCache: Map<string, CachedNode>;
    _isInitialized: boolean;
    _nodeLoader: { errorKeys: Set<string> };
    _cycleExecutor: {
        refreshRender: (force?: boolean) => void;
    } | null;
    _runCycle: (input: unknown) => Promise<void>;
}

const SOURCE_URL = "https://example.com/cloud.copc.laz";

/** The suite asserts on internal accounting via the same cast the loadRace suite uses. */
function internals(loader: CopcStreamingLoader): LoaderInternals {
    return loader as unknown as LoaderInternals;
}

function makeNode(pointCount = 100, key = "0-0-0-0"): CachedNode {
    const bounds = Bbox.fromCorners({
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 1,
        maxY: 1,
        maxZ: 1,
    });
    return {
        key,
        keyArray: [0, 0, 0, 0],
        state: "pending",
        pointCount,
        pointDataOffset: 0,
        pointDataLength: 0,
        bounds,
        boundsWgs84: bounds,
    };
}

async function makeInitializedLoader(): Promise<CopcStreamingLoader> {
    const loader = new CopcStreamingLoader(
        SOURCE_URL,
        { maxConcurrentRequests: 2, maxOctreeDepth: 20 },
        Promise.resolve({} as never),
    );
    await loader.initialize();
    return loader;
}

function seedLoadedNodes(loader: CopcStreamingLoader, count: number): void {
    const cache = internals(loader)["_nodeCache"];
    for (let i = 0; i < count; i++) {
        const node = makeNode(10, `node-${i}`);
        node.state = "loaded";
        cache.set(node.key, node);
    }
}

type LoadNodeFn = (node: CachedNode, signal: AbortSignal) => Promise<void>;

async function callLoadNode(
    loader: CopcStreamingLoader,
    node: CachedNode,
): Promise<void> {
    const fn = loader as unknown as { _loadNode: LoadNodeFn };
    await fn["_loadNode"](node, new AbortController().signal);
}

async function flushMicrotasks(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    initCopcMock.mockReset();
    initCopcMock.mockResolvedValue(INIT_FIXTURE);
    loadPointDataViewMock.mockReset();
    loadPointDataViewMock.mockResolvedValue({});
    extractMock.mockReset();
    extractMock.mockResolvedValue(undefined);
    ensureMock.mockReset();
    ensureMock.mockResolvedValue(undefined);
    disposeMock.mockClear();
});

describe("CopcStreamingLoader.switchScheme before initialization", () => {
    it("records the scheme without starting any recolor or cycle", () => {
        const loader = new CopcStreamingLoader(
            SOURCE_URL,
            { maxConcurrentRequests: 4, maxOctreeDepth: 20 },
            Promise.resolve({} as never),
        );

        loader.switchScheme(ColorScheme.ELEVATION);

        const state = internals(loader)["_cycleState"];
        expect(state.activeScheme).toBe(ColorScheme.ELEVATION);
        expect(state.frameCounter).toBe(0);
        expect(ensureMock).not.toHaveBeenCalled();
    });
});

describe("CopcStreamingLoader.initialize", () => {
    it("resolves the cloud metadata once the init pipeline settles", async () => {
        const loader = new CopcStreamingLoader(
            SOURCE_URL,
            { maxConcurrentRequests: 2, maxOctreeDepth: 20 },
            Promise.resolve({} as never),
        );

        const meta = await loader.initialize();

        expect(meta).toEqual({
            bounds: INIT_FIXTURE.meta.bounds,
            totalPoints: 1000,
            spacing: 1,
            spacingMeters: 1,
        });
        expect(internals(loader)["_isInitialized"]).toBe(true);
    });

    it("propagates an init failure and stays uninitialized", async () => {
        initCopcMock.mockRejectedValueOnce(new Error("Invalid COPC header"));
        const loader = new CopcStreamingLoader(
            SOURCE_URL,
            { maxConcurrentRequests: 2, maxOctreeDepth: 20 },
            Promise.resolve({} as never),
        );

        await expect(loader.initialize()).rejects.toThrow("Invalid COPC header");
        expect(internals(loader)["_isInitialized"]).toBe(false);
    });
});

describe("CopcStreamingLoader scheme switch", () => {
    it("ignores a stale recolor completion, honors the fresh one", async () => {
        const loader = await makeInitializedLoader();
        const executor = internals(loader)["_cycleExecutor"]!;
        const refresh = vi.spyOn(executor, "refreshRender");
        const gates: Array<() => void> = [];
        ensureMock.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    gates.push(resolve);
                }),
        );

        loader.switchScheme(ColorScheme.ELEVATION);
        loader.switchScheme(ColorScheme.INTENSITY);
        expect(ensureMock).toHaveBeenCalledTimes(2);

        gates[0]!();
        await flushMicrotasks();
        expect(refresh).not.toHaveBeenCalled();

        gates[1]!();
        await flushMicrotasks();
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledWith(true);
    });

    it("recolors the non-visible cache in chained chunks of 16", async () => {
        const loader = await makeInitializedLoader();
        seedLoadedNodes(loader, 40);

        loader.switchScheme(ColorScheme.ELEVATION);
        for (let i = 0; i < 4; i++) {
            await flushMicrotasks();
        }

        const chunkSizes = ensureMock.mock.calls.map(
            ([, nodes]) => nodes.length,
        );
        // First call covers the (empty) visible set, then 16/16/8 chunks.
        expect(chunkSizes).toEqual([0, 16, 16, 8]);
    });

    it("stops the background pump when destroyed mid-flight", async () => {
        const loader = await makeInitializedLoader();
        seedLoadedNodes(loader, 40);
        const gates: Array<() => void> = [];
        ensureMock.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    gates.push(resolve);
                }),
        );

        loader.switchScheme(ColorScheme.ELEVATION);
        expect(ensureMock).toHaveBeenCalledTimes(2); // visible set + first chunk

        loader.destroy();
        for (const gate of gates.splice(0)) gate();
        await flushMicrotasks();
        await flushMicrotasks();

        expect(ensureMock).toHaveBeenCalledTimes(2);
    });
});

describe("CopcStreamingLoader load accounting", () => {
    it("counts a successful load in the point and node budget", async () => {
        const loader = await makeInitializedLoader();
        const node = makeNode(100);
        extractMock.mockImplementation(async (_view, target) => {
            target.positions = new Float32Array(3);
        });

        await callLoadNode(loader, node);

        const state = internals(loader)["_cycleState"];
        expect(node.state).toBe("loaded");
        expect(state.totalLoadedPoints).toBe(100);
        expect(state.totalLoadedNodes).toBe(1);
        // RGB is computed eagerly in the worker — no lazy recolor needed.
        expect(ensureMock).not.toHaveBeenCalled();
    });

    it("refunds the budget and schedules a retry when a load fails", async () => {
        const loader = await makeInitializedLoader();
        const node = makeNode(100);
        loadPointDataViewMock.mockRejectedValue(new Error("HTTP 500"));

        await callLoadNode(loader, node);

        const state = internals(loader)["_cycleState"];
        expect(node.state).toBe("error");
        expect(node.error).toBe("HTTP 500");
        expect(node.retryAt).toBeGreaterThan(0);
        expect(state.totalLoadedPoints).toBe(0);
        expect(
            internals(loader)["_nodeLoader"].errorKeys.has(node.key),
        ).toBe(true);
    });

    it("returns an aborted node to pending without error tracking", async () => {
        const loader = await makeInitializedLoader();
        const node = makeNode(100);
        loadPointDataViewMock.mockRejectedValue(
            new DOMException("Aborted", "AbortError"),
        );

        await callLoadNode(loader, node);

        const state = internals(loader)["_cycleState"];
        expect(node.state).toBe("pending");
        expect(node.error).toBeUndefined();
        expect(node.retryAt).toBeUndefined();
        expect(state.totalLoadedPoints).toBe(0);
        expect(
            internals(loader)["_nodeLoader"].errorKeys.has(node.key),
        ).toBe(false);
    });
});

describe("CopcStreamingLoader teardown", () => {
    it("disposes the worker pool, clears the cache, silences the callback", async () => {
        const loader = await makeInitializedLoader();
        loader.setOnPointsLoaded(vi.fn());
        seedLoadedNodes(loader, 2);

        loader.destroy();

        expect(disposeMock).toHaveBeenCalledTimes(1);
        expect(internals(loader)["_nodeCache"].size).toBe(0);
        expect(internals(loader)["_cycleState"].onPointsLoaded).toBeNull();
    });

    it("ignores cycle requests after destroy", async () => {
        const loader = await makeInitializedLoader();
        const runCycle = vi.spyOn(
            loader as unknown as { _runCycle: (input: unknown) => Promise<void> },
            "_runCycle",
        );

        loader.destroy();
        loader.selectNodesSSE({} as CameraSnapshot, [0, 0, 1, 1]);
        await flushMicrotasks();

        expect(runCycle).not.toHaveBeenCalled();
    });
});
