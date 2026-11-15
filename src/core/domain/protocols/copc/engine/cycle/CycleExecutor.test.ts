import { describe, expect, it, vi } from "vitest";
import { ColorScheme, type PointCloudData } from "@core/contracts";
import { Bbox, type BBox3D } from "@core/lib/geo";
import type { FrustumPlanes } from "@core/contracts";
import type { CachedNode } from "../../types";
import type { CameraSnapshot } from "../geometry";
import {
    CycleExecutor,
    type CycleServices,
    type CycleState,
} from "./CycleExecutor";

const ROOT_KEY = "0-0-0-0";

const BBOX: BBox3D = Bbox.fromCorners({
    minX: 10,
    minY: 10,
    minZ: 0,
    maxX: 11,
    maxY: 11,
    maxZ: 0,
});

function node(key: string): CachedNode {
    const [depth, x, y, z] = key.split("-").map(Number);
    return {
        key,
        keyArray: [depth, x, y, z] as [number, number, number, number],
        state: "loaded",
        pointCount: 1,
        pointDataOffset: 0,
        pointDataLength: 1,
        bounds: BBOX,
        boundsWgs84: BBOX,
    };
}

/** Frustum planes pushed far enough out to accept every AABB in this suite. */
const PERMISSIVE_PLANES: FrustumPlanes = {
    near: { normal: [0, 0, -1], distance: 1e9 },
    far: { normal: [0, 0, -1], distance: 1e9 },
    left: { normal: [0, 0, -1], distance: 1e9 },
    right: { normal: [0, 0, -1], distance: 1e9 },
    top: { normal: [0, 0, -1], distance: 1e9 },
    bottom: { normal: [0, 0, -1], distance: 1e9 },
};

function createCamera(): CameraSnapshot {
    return {
        cameraPos: [10.5, 10.5, 100],
        cameraDirection: [0, 0, -1],
        fovRadians: Math.PI / 3,
        screenHeightPx: 1080,
        pixelRatio: 1,
        frustumPlanes: PERMISSIVE_PLANES,
        projectToCommonSpace: (lng: number, lat: number) => [lng, lat, 0],
    };
}

function mockData(): PointCloudData {
    return {
        pointCount: 1,
        positions: new Float32Array(3),
        colors: new Uint8Array(4),
        coordinateOrigin: [0, 0, 0],
        bounds: BBOX,
    };
}

interface Harness {
    executor: CycleExecutor;
    state: CycleState;
    renderPool: { build: ReturnType<typeof vi.fn> };
    nodeCache: Map<string, CachedNode>;
    /** Mutable stub — tests bump `loadStamp` to simulate settled loads. */
    nodeLoader: { loadStamp: number };
}

function createHarness(keys: string[] = [ROOT_KEY]): Harness {
    const renderPool = { build: vi.fn(() => mockData()) };

    const state: CycleState = {
        frameCounter: 0,
        totalLoadedPoints: 0,
        totalLoadedNodes: 0,
        lastCameraSnapshot: null,
        lastVisibleKeys: null,
        depthDistribution: new Map(),
        maxDepthInHierarchy: 0,
        effectiveBaseline: { maxScreenErrorPx: 2, pointBudget: 1_000_000 },
        activeScheme: ColorScheme.RGB,
        hiddenClassifications: new Set(),
        onPointsLoaded: null,
    };

    const nodeCache = new Map(keys.map((k) => [k, node(k)]));
    const nodeLoader = { loadStamp: 0 };
    const services = {
        nodeCache,
        renderPool,
        nodeLoader,
        geometricErrorByDepth: () => 0.5,
        coordinateOrigin: [0, 0, 0] as [number, number, number],
        bounds: BBOX,
    } as unknown as CycleServices;

    return {
        executor: new CycleExecutor(services, state),
        state,
        renderPool,
        nodeCache,
        nodeLoader,
    };
}

const CANDIDATE_KEY = "1-0-0-0";
const CANDIDATE_RANK = 42;
const POINT_BUDGET = 1_000_000;
/** The pending candidate's weight — the demand eviction must reserve for. */
const CANDIDATE_POINTS = 300_000;

interface CycleHarness {
    executor: CycleExecutor;
    state: CycleState;
    nodeCache: Map<string, CachedNode>;
    enqueueBatch: ReturnType<typeof vi.fn>;
    evictToBudget: ReturnType<typeof vi.fn>;
    traversalRun: ReturnType<typeof vi.fn>;
    renderPool: {
        build: ReturnType<typeof vi.fn>;
        commit: ReturnType<typeof vi.fn>;
    };
    nodeLoader: {
        hasPendingWork: ReturnType<typeof vi.fn>;
        drain: ReturnType<typeof vi.fn>;
    };
}

/**
 * A harness for the whole cycle, not just the render tail: the collaborators
 * a cycle reaches for are stubs, so the assertions land on what the executor
 * hands them.
 */
function createCycleHarness(): CycleHarness {
    const enqueueBatch = vi.fn(() => 0);
    const evictToBudget = vi.fn(() => ({ freedPoints: 0, evictedCount: 0 }));
    const hasPendingWork = vi.fn(() => false);
    const drain = vi.fn(async () => {});
    const commitFrame = { base: mockData(), incoming: null };
    const build = vi.fn(() => mockData());
    const commit = vi.fn(() => commitFrame);

    const candidate = {
        key: CANDIDATE_KEY,
        screenError: 10,
        priority: CANDIDATE_RANK,
        distanceToCamera: 100,
    };

    const nodeCache = new Map([
        [
            CANDIDATE_KEY,
            {
                ...node(CANDIDATE_KEY),
                state: "pending" as const,
                pointCount: CANDIDATE_POINTS,
            },
        ],
    ]);

    const services = {
        nodeCache,
        renderPool: { build, commit },
        eviction: { evictToBudget },
        nodeLoader: {
            cancelStale: vi.fn(),
            enqueueBatch,
            drain,
            hasPendingWork,
            errorKeys: new Set<string>(),
            loadStamp: 0,
        },
        hierarchyTracker: { ensureLoaded: vi.fn(async () => {}) },
        traversal: {
            run: vi.fn(async () => ({
                candidates: [candidate],
                fallbacks: new Map<string, string>(),
                pendingHierarchyExpansions: [],
                priorityBounds: {},
            })),
        },
        geometricErrorByDepth: () => 0.5,
        coordinateOrigin: [0, 0, 0] as [number, number, number],
        bounds: BBOX,
        rootHierarchyPage: {},
    } as unknown as CycleServices;

    const state: CycleState = {
        frameCounter: 0,
        totalLoadedPoints: 0,
        totalLoadedNodes: 0,
        lastCameraSnapshot: null,
        lastVisibleKeys: null,
        depthDistribution: new Map(),
        maxDepthInHierarchy: 0,
        effectiveBaseline: { maxScreenErrorPx: 2, pointBudget: POINT_BUDGET },
        activeScheme: ColorScheme.RGB,
        hiddenClassifications: new Set(),
        onPointsLoaded: null,
    };

    return {
        executor: new CycleExecutor(services, state),
        state,
        nodeCache,
        enqueueBatch,
        evictToBudget,
        traversalRun: services.traversal.run as ReturnType<typeof vi.fn>,
        renderPool: { build, commit },
        nodeLoader: { hasPendingWork, drain },
    };
}

function runCycle(harness: CycleHarness): Promise<void> {
    return harness.executor.run(
        { cameraSnapshot: createCamera(), viewportBounds: [10, 10, 11, 11] },
        vi.fn(),
    );
}

describe("CycleExecutor.run", () => {
    it("hands the loader each candidate's rank exactly as the traversal set it", async () => {
        const harness = createCycleHarness();

        await runCycle(harness);

        const getPriority = harness.enqueueBatch.mock.calls[0]?.[1] as (
            key: string,
        ) => number;
        expect(getPriority(CANDIDATE_KEY)).toBe(CANDIDATE_RANK);
    });

    it("sinks a key the traversal never ranked to the back of the queue", async () => {
        const harness = createCycleHarness();

        await runCycle(harness);

        const getPriority = harness.enqueueBatch.mock.calls[0]?.[1] as (
            key: string,
        ) => number;
        expect(getPriority("9-9-9-9")).toBe(Infinity);
    });

    it("carries the traversal's rank onto the cached node it describes", async () => {
        const harness = createCycleHarness();

        await runCycle(harness);

        expect(harness.nodeCache.get(CANDIDATE_KEY)?.priority).toBe(
            CANDIDATE_RANK,
        );
    });

    it("reserves the view's unserved demand in the eviction target", async () => {
        const harness = createCycleHarness();

        await runCycle(harness);

        expect(harness.evictToBudget).toHaveBeenCalledWith(
            expect.objectContaining({
                targetPoints: POINT_BUDGET - CANDIDATE_POINTS,
            }),
        );
    });

    it("evicts before planning, so the plan sees the freed budget", async () => {
        const harness = createCycleHarness();

        await runCycle(harness);

        const evictOrder = harness.evictToBudget.mock.invocationCallOrder[0];
        const enqueueOrder = harness.enqueueBatch.mock.invocationCallOrder[0];
        expect(evictOrder).toBeDefined();
        expect(enqueueOrder).toBeDefined();
        expect(evictOrder!).toBeLessThan(enqueueOrder!);
    });

    it("stamps every candidate with the cycle's frame — the eviction protection", async () => {
        const harness = createCycleHarness();

        await runCycle(harness);

        expect(harness.nodeCache.get(CANDIDATE_KEY)?.lastSeenAt).toBe(
            harness.state.frameCounter,
        );
    });

    it("waits out adopted loads even when it enqueued nothing of its own", async () => {
        const harness = createCycleHarness();
        // Everything wanted is already in flight from a superseded cycle.
        harness.enqueueBatch.mockReturnValue(0);
        harness.nodeLoader.hasPendingWork.mockReturnValue(true);

        await runCycle(harness);

        expect(harness.nodeLoader.drain).toHaveBeenCalledTimes(1);
    });

    it("skips the drain entirely when nothing was enqueued and nothing runs", async () => {
        const harness = createCycleHarness();
        harness.enqueueBatch.mockReturnValue(0);
        harness.nodeLoader.hasPendingWork.mockReturnValue(false);

        await runCycle(harness);

        expect(harness.nodeLoader.drain).not.toHaveBeenCalled();
    });
});

describe("CycleExecutor.run — post-drain commit", () => {
    it("folds the streamed nodes into a committed base after the drain", async () => {
        const harness = createCycleHarness();
        harness.enqueueBatch.mockReturnValue(3);
        harness.state.onPointsLoaded = vi.fn();

        await runCycle(harness);

        expect(harness.renderPool.commit).toHaveBeenCalledTimes(1);
        expect(harness.renderPool.build).not.toHaveBeenCalled();
        expect(harness.state.onPointsLoaded).toHaveBeenCalledWith(
            harness.renderPool.commit.mock.results[0]?.value,
        );
    });

    it("does not commit a superseded cycle's stale view", async () => {
        const harness = createCycleHarness();
        harness.enqueueBatch.mockReturnValue(3);
        harness.state.onPointsLoaded = vi.fn();
        const aborted = new AbortController();
        aborted.abort();

        await harness.executor.run(
            {
                cameraSnapshot: createCamera(),
                viewportBounds: [10, 10, 11, 11],
            },
            vi.fn(),
            aborted.signal,
        );

        expect(harness.renderPool.commit).not.toHaveBeenCalled();
        expect(harness.state.onPointsLoaded).not.toHaveBeenCalled();
    });
});

describe("CycleExecutor.refreshRender", () => {
    it("is a no-op without a camera snapshot", () => {
        const { executor, state } = createHarness();
        state.onPointsLoaded = vi.fn();

        expect(() => executor.refreshRender()).not.toThrow();
        expect(state.onPointsLoaded).not.toHaveBeenCalled();
    });

    it("rebuilds the render buffer with the active scheme", () => {
        const { executor, state, renderPool } = createHarness();
        state.lastCameraSnapshot = createCamera();
        state.activeScheme = ColorScheme.ELEVATION;
        state.onPointsLoaded = vi.fn();

        executor.refreshRender();

        expect(renderPool.build).toHaveBeenCalledWith(
            [ROOT_KEY],
            expect.any(Map),
            expect.objectContaining({ scheme: ColorScheme.ELEVATION }),
        );
        expect(state.onPointsLoaded).toHaveBeenCalledTimes(1);
    });

    it("skips the rebuild when the visible set is unchanged", () => {
        const { executor, state } = createHarness();
        state.lastCameraSnapshot = createCamera();
        state.onPointsLoaded = vi.fn();

        executor.refreshRender();
        executor.refreshRender();

        expect(state.onPointsLoaded).toHaveBeenCalledTimes(1);
    });

    it("rebuilds when loads settled since the last push, same set or not", () => {
        const { executor, state, nodeLoader } = createHarness();
        state.lastCameraSnapshot = createCamera();
        state.onPointsLoaded = vi.fn();

        executor.refreshRender();
        expect(state.onPointsLoaded).toHaveBeenCalledTimes(1);

        nodeLoader.loadStamp = 1;
        executor.refreshRender();

        expect(state.onPointsLoaded).toHaveBeenCalledTimes(2);
    });

    it("re-renders when the visible set changes only in the middle", () => {
        const { executor, state, nodeCache } = createHarness([
            "2-0-0-0",
            "2-0-0-1",
            "2-0-0-3",
        ]);
        state.lastCameraSnapshot = createCamera();
        state.onPointsLoaded = vi.fn();

        executor.refreshRender();
        expect(state.onPointsLoaded).toHaveBeenCalledTimes(1);

        // Same length, same first/last key — only the middle key changes.
        nodeCache.get("2-0-0-1")!.state = "pending";
        nodeCache.set("2-0-0-2", node("2-0-0-2"));

        executor.refreshRender();

        expect(state.onPointsLoaded).toHaveBeenCalledTimes(2);
    });

    it("re-renders after a scheme switch even with the same visible set", () => {
        const { executor, state, renderPool } = createHarness();
        state.lastCameraSnapshot = createCamera();
        state.onPointsLoaded = vi.fn();

        executor.refreshRender();
        expect(state.onPointsLoaded).toHaveBeenCalledTimes(1);

        // switchScheme resets the guard state to force a rebuild.
        state.activeScheme = ColorScheme.ELEVATION;
        state.lastVisibleKeys = null;

        executor.refreshRender();

        expect(state.onPointsLoaded).toHaveBeenCalledTimes(2);
        expect(renderPool.build).toHaveBeenLastCalledWith(
            [ROOT_KEY],
            expect.any(Map),
            expect.objectContaining({ scheme: ColorScheme.ELEVATION }),
        );
    });

    it("re-renders when the set grows after a partial refresh", () => {
        const { executor, state, nodeCache } = createHarness([
            "2-0-0-0",
            "2-0-0-1",
            "2-0-0-3",
        ]);
        state.lastCameraSnapshot = createCamera();
        state.onPointsLoaded = vi.fn();

        nodeCache.get("2-0-0-1")!.state = "pending";
        executor.refreshRender();
        expect(state.onPointsLoaded).toHaveBeenCalledTimes(1);

        nodeCache.get("2-0-0-1")!.state = "loaded";
        executor.refreshRender();

        expect(state.onPointsLoaded).toHaveBeenCalledTimes(2);
    });
});

describe("CycleExecutor.run — lazy hierarchy convergence", () => {
    const INPUT = {
        cameraSnapshot: createCamera(),
        viewportBounds: [10, 10, 11, 11] as [number, number, number, number],
    };

    it("requests a follow-up cycle when the traversal fetched hierarchy pages", async () => {
        const harness = createCycleHarness();
        harness.traversalRun.mockResolvedValue({
            candidates: [],
            fallbacks: new Map(),
            pendingHierarchyExpansions: ["1-0-0-0"],
            priorityBounds: {},
            expandedPages: 3,
        });
        const requestRetry = vi.fn();

        await harness.executor.run(INPUT, requestRetry);

        expect(requestRetry).toHaveBeenCalledTimes(1);
        expect(requestRetry).toHaveBeenCalledWith(INPUT);
    });

    it("does not retry when discovery made no progress", async () => {
        const harness = createCycleHarness();
        harness.traversalRun.mockResolvedValue({
            candidates: [],
            fallbacks: new Map(),
            pendingHierarchyExpansions: ["1-0-0-0"],
            priorityBounds: {},
            expandedPages: 0,
        });
        const requestRetry = vi.fn();

        await harness.executor.run(INPUT, requestRetry);

        expect(requestRetry).not.toHaveBeenCalled();
    });

    it("does not retry a superseded cycle — the newer input brings its own", async () => {
        const harness = createCycleHarness();
        harness.traversalRun.mockResolvedValue({
            candidates: [],
            fallbacks: new Map(),
            pendingHierarchyExpansions: ["1-0-0-0"],
            priorityBounds: {},
            expandedPages: 3,
        });
        const requestRetry = vi.fn();
        const aborted = new AbortController();
        aborted.abort();

        await harness.executor.run(INPUT, requestRetry, aborted.signal);

        expect(requestRetry).not.toHaveBeenCalled();
    });
});

describe("CycleExecutor.run — settle retry", () => {
    const INPUT = {
        cameraSnapshot: createCamera(),
        viewportBounds: [10, 10, 11, 11] as [number, number, number, number],
    };

    /**
     * A loaded node the traversal never visits holds the whole budget —
     * after the cycle's eviction, residency still sits above the target
     * while the pending candidate keeps demand unserved.
     */
    function overspendBudget(harness: CycleHarness): void {
        const stale = {
            ...node("9-9-9-9"),
            state: "loaded" as const,
            pointCount: POINT_BUDGET,
        };
        harness.nodeCache.set(stale.key, stale);
        harness.state.totalLoadedPoints = POINT_BUDGET;
    }

    it("settles after a productive cycle that left demand unserved over target", async () => {
        const harness = createCycleHarness();
        overspendBudget(harness);
        harness.evictToBudget.mockReturnValue({
            freedPoints: 500,
            evictedCount: 1,
        });
        const requestRetry = vi.fn();

        await harness.executor.run(INPUT, requestRetry);

        expect(requestRetry).toHaveBeenCalledTimes(1);
        expect(requestRetry).toHaveBeenCalledWith(INPUT);
    });

    it("does not retry when the cycle moved nothing — a retry would repeat it", async () => {
        const harness = createCycleHarness();
        overspendBudget(harness);
        const requestRetry = vi.fn();

        await harness.executor.run(INPUT, requestRetry);

        expect(requestRetry).not.toHaveBeenCalled();
    });

    it("does not retry when the view's demand is satisfied", async () => {
        const harness = createCycleHarness();
        overspendBudget(harness);
        harness.evictToBudget.mockReturnValue({
            freedPoints: 500,
            evictedCount: 1,
        });
        const settled = harness.nodeCache.get(CANDIDATE_KEY)!;
        settled.state = "loaded";
        const requestRetry = vi.fn();

        await harness.executor.run(INPUT, requestRetry);

        expect(requestRetry).not.toHaveBeenCalled();
    });

    it("does not retry when residency already fits the target", async () => {
        const harness = createCycleHarness();
        harness.enqueueBatch.mockReturnValue(5);
        const requestRetry = vi.fn();

        await harness.executor.run(INPUT, requestRetry);

        expect(requestRetry).not.toHaveBeenCalled();
    });
});
