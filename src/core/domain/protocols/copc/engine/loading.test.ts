import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedNode } from "../types";
import { cachedNode } from "./__testFactories";
import { NodeLoader } from "./loading";

const URGENT = "1-0-0-0";
const MIDDLE = "1-1-0-0";
const SLACK = "1-1-1-1";

/** Ranks as the traversal produces them — lower means more urgent. */
const RANKS = new Map([
    [SLACK, 30],
    [URGENT, 10],
    [MIDDLE, 20],
]);

const NOW = 1_700_000_000_000;
const A_WHILE = 5_000;

const rankOf = (key: string): number => RANKS.get(key) ?? Infinity;

interface Harness {
    loader: NodeLoader;
    cache: Map<string, CachedNode>;
    served: string[];
}

function harness(
    nodes: CachedNode[],
    maxConcurrentRequests = 1,
): Harness {
    const cache = new Map(nodes.map((node) => [node.key, node]));
    const served: string[] = [];
    const loader = new NodeLoader(
        cache,
        maxConcurrentRequests,
        async (node) => {
            served.push(node.key);
        },
    );
    return { loader, cache, served };
}

function pending(key: string): CachedNode {
    return cachedNode(key, { state: "pending" });
}

/** All three keys, pending — the ordinary starting point for a cycle. */
function allPending(): CachedNode[] {
    return [...RANKS.keys()].map(pending);
}

/** A node mid-flight. */
function inFlight(key: string): CachedNode {
    return cachedNode(key, { state: "loading" });
}

describe("NodeLoader queue", () => {
    it("serves the queue by ascending rank, the most urgent node first", () => {
        const { loader, served } = harness(allPending());

        loader.enqueueBatch([...RANKS.keys()], rankOf);
        loader.startPending();
        loader.onLoadSettled();
        loader.onLoadSettled();

        expect(served).toEqual([URGENT, MIDDLE, SLACK]);
    });

    it("honours the concurrency limit, holding the rest of the queue back", () => {
        const { loader, served } = harness(allPending());

        loader.enqueueBatch([...RANKS.keys()], rankOf);
        loader.startPending();

        expect(served).toEqual([URGENT]);
        loader.onLoadSettled();
        expect(served).toEqual([URGENT, MIDDLE]);
    });

    it("passes over a node already in flight or already here", () => {
        const nodes = [
            cachedNode(URGENT, { state: "loading" }),
            cachedNode(MIDDLE, { state: "loaded" }),
            pending(SLACK),
        ];
        const { loader } = harness(nodes);

        expect(loader.enqueueBatch([...RANKS.keys()], rankOf)).toBe(1);
    });
});

/** A load started but not settled — the test resolves or rejects it. */
interface DeferredLoad {
    key: string;
    signal: AbortSignal;
    resolve: () => void;
    reject: (error: unknown) => void;
}

/**
 * Harness whose loads stay in flight until the test settles them, mirroring
 * a real range-request. The signal is the one NodeLoader would abort.
 */
function deferredHarness(
    nodes: CachedNode[],
    maxConcurrentRequests = 1,
): { loader: NodeLoader; cache: Map<string, CachedNode>; loads: DeferredLoad[] } {
    const cache = new Map(nodes.map((node) => [node.key, node]));
    const loads: DeferredLoad[] = [];
    const loader = new NodeLoader(
        cache,
        maxConcurrentRequests,
        (node, signal) => {
            // Mirrors the real load entry: claim the node, swallow errors the
            // way _loadNode's catch does — the loader never rejects outward.
            node.state = "loading";
            return new Promise<void>((resolve, reject) => {
                loads.push({ key: node.key, signal, resolve, reject });
            }).catch(() => {});
        },
    );
    return { loader, cache, loads };
}

const abortError = (): DOMException =>
    new DOMException("Aborted", "AbortError");

describe("NodeLoader in-flight dedup", () => {
    it("keeps one queue entry per key no matter how often it is enqueued", () => {
        const node = pending(URGENT);
        const { loader, loads } = deferredHarness([node]);

        loader.enqueueOne(node);
        loader.enqueueOne(node);

        loader.startPending();
        expect(loads).toHaveLength(1);
    });

    it("returns the concurrency slot after a duplicate settles — no leak", async () => {
        const nodes = [pending(URGENT), pending(MIDDLE)];
        const { loader, loads } = deferredHarness(nodes);

        loader.enqueueOne(nodes[0]!);
        loader.enqueueOne(nodes[0]!);
        loader.startPending();
        loads[0]!.resolve();
        await flushMicrotasks();
        loader.onLoadSettled();

        loader.enqueueOne(nodes[1]!);
        loader.startPending();
        expect(loads.map((l) => l.key)).toEqual([URGENT, MIDDLE]);
    });

    it("does not start a second load for a node whose cancelled load is still settling", async () => {
        const node = pending(URGENT);
        // Two slots, as in production: the limit must not be what prevents
        // the double load — the in-flight dedup must.
        const { loader, loads } = deferredHarness([node], 2);

        loader.enqueueOne(node);
        loader.startPending();
        expect(loads.map((l) => l.key)).toEqual([URGENT]);

        loader.cancelStale(new Set());
        // The abort window: the first load has not settled yet, so a fresh
        // enqueue must not dispatch a parallel load for the same node. The
        // node loads on a later cycle instead — self-healing, never lost.
        loader.enqueueOne(node);
        loader.startPending();
        expect(loads).toHaveLength(1);

        loads[0]!.reject(abortError());
        await flushMicrotasks();
        loader.onLoadSettled();

        loader.enqueueOne(node);
        loader.startPending();
        expect(loads.map((l) => l.key)).toEqual([URGENT, URGENT]);
    });
});

describe("NodeLoader.cancelStale aborts in-flight loads", () => {
    it("aborts the underlying request and releases the slot on settle", async () => {
        const node = pending(URGENT);
        const { loader, loads } = deferredHarness([node]);
        loader.enqueueOne(node);
        loader.startPending();

        const drained = loader.drain();
        loader.cancelStale(new Set());
        expect(loads[0]!.signal.aborted).toBe(true);
        expect(node.state).toBe("pending");

        loads[0]!.reject(abortError());
        await flushMicrotasks();
        loader.onLoadSettled();

        await expect(drained).resolves.toBeUndefined();
    });

    it("lets an in-flight load the camera still wants run on un-aborted", () => {
        const node = pending(URGENT);
        const { loader, loads } = deferredHarness([node]);
        loader.enqueueOne(node);
        loader.startPending();

        loader.cancelStale(new Set([URGENT]));

        expect(loads[0]!.signal.aborted).toBe(false);
    });
});

describe("NodeLoader.cancelAll", () => {
    it("aborts every in-flight load, empties the queue and releases the drain", async () => {
        const nodes = [pending(URGENT), pending(MIDDLE)];
        const { loader, loads } = deferredHarness(nodes, 2);

        for (const node of nodes) loader.enqueueOne(node);
        loader.startPending();
        const drained = loader.drain();

        loader.cancelAll();

        expect(loads.map((l) => l.signal.aborted)).toEqual([true, true]);

        for (const load of loads) load.reject(abortError());
        await flushMicrotasks();
        // The real _loadNode settles in its finally — once per load.
        loader.onLoadSettled();
        loader.onLoadSettled();
        await expect(drained).resolves.toBeUndefined();
    });
});

describe("NodeLoader retry window", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("holds back a node whose retry time has not come", () => {
        const node = cachedNode(URGENT, {
            state: "error",
            retryAt: NOW + A_WHILE,
        });
        const { loader } = harness([node]);

        expect(loader.enqueueBatch([URGENT], rankOf)).toBe(0);
        expect(node.state).toBe("error");
    });

    it("takes the node once its retry time passes, clearing the failure first", () => {
        const node = cachedNode(URGENT, {
            state: "error",
            error: "timeout",
            retryAt: NOW - A_WHILE,
        });
        const { loader, served } = harness([node]);

        loader.enqueueBatch([URGENT], rankOf);
        loader.startPending();

        expect(served).toEqual([URGENT]);
        expect(node.error).toBeUndefined();
    });

    it("requeues an expired error and stops tracking it as failed", () => {
        const node = cachedNode(URGENT, {
            state: "error",
            error: "timeout",
            retryAt: NOW - A_WHILE,
        });
        const { loader, served } = harness([node]);
        loader.addErrorNode(URGENT);

        loader.requeueExpiredErrors();
        loader.startPending();

        expect(served).toEqual([URGENT]);
        expect(loader.errorKeys.has(URGENT)).toBe(false);
    });

    it("leaves an error node still inside its wait alone", () => {
        const node = cachedNode(URGENT, {
            state: "error",
            retryAt: NOW + A_WHILE,
        });
        const { loader } = harness([node]);
        loader.addErrorNode(URGENT);

        loader.requeueExpiredErrors();

        expect(node.state).toBe("error");
        expect(loader.errorKeys.has(URGENT)).toBe(true);
    });

    it("stops tracking a key whose node recovered elsewhere", () => {
        const { loader } = harness([cachedNode(URGENT)]);
        loader.addErrorNode(URGENT);

        loader.requeueExpiredErrors();

        expect(loader.errorKeys.has(URGENT)).toBe(false);
    });

    it("requeues no more per call than it could start at once", () => {
        const expired = (key: string): CachedNode =>
            cachedNode(key, { state: "error", retryAt: NOW - A_WHILE });
        const { loader, served } = harness([...RANKS.keys()].map(expired), 2);
        for (const key of RANKS.keys()) loader.addErrorNode(key);

        loader.requeueExpiredErrors();
        loader.startPending();

        expect(served).toHaveLength(2);
    });
});

describe("NodeLoader.cancelStale", () => {
    it("resets an in-flight load the camera has moved away from", () => {
        const stale = inFlight(URGENT);
        const loader = new NodeLoader(
            new Map([[URGENT, stale]]),
            1,
            async () => {},
        );
        const abandoned: string[] = [];

        loader.cancelStale(new Set(), (node) => abandoned.push(node.key));

        expect(stale.state).toBe("pending");
        expect(abandoned).toEqual([URGENT]);
    });

    it("lets an in-flight load the camera still wants run on", () => {
        const wanted = inFlight(URGENT);
        const loader = new NodeLoader(
            new Map([[URGENT, wanted]]),
            1,
            async () => {},
        );

        loader.cancelStale(new Set([URGENT]));

        expect(wanted.state).toBe("loading");
    });

    it("drops queued nodes the camera has moved away from and keeps the rest", () => {
        const { loader, served } = harness(allPending());
        loader.enqueueBatch([...RANKS.keys()], rankOf);

        loader.cancelStale(new Set([MIDDLE]));
        loader.startPending();

        expect(served).toEqual([MIDDLE]);
    });
});

/**
 * Cross a macrotask boundary, which runs every pending microtask.
 *
 * `drain` is an async method returning a promise, so its resolution reaches an
 * awaiting caller several ticks later; a single `await` would read as "still
 * waiting" even for a drain that resolved immediately.
 */
function flushMicrotasks(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("NodeLoader.drain", () => {
    it("returns at once when nothing is queued and nothing is in flight", async () => {
        const { loader } = harness(allPending());

        await expect(loader.drain()).resolves.toBeUndefined();
    });

    it("waits for the whole queue, not merely the batch it could start at once", async () => {
        const { loader } = harness(allPending());
        loader.enqueueBatch([URGENT, MIDDLE], rankOf);

        let settled = false;
        const drained = loader.drain().then(() => {
            settled = true;
        });

        await flushMicrotasks();
        expect(settled).toBe(false);

        loader.onLoadSettled();
        await flushMicrotasks();
        expect(settled).toBe(false);

        loader.onLoadSettled();
        await drained;
        expect(settled).toBe(true);
    });

    it("fires the progress hook per settle and drops it once drained", async () => {
        const { loader } = harness(allPending());
        loader.enqueueBatch([URGENT, MIDDLE], rankOf);

        const progress = vi.fn();
        const drained = loader.drain(progress);

        loader.onLoadSettled();
        loader.onLoadSettled();
        await drained;

        expect(progress).toHaveBeenCalledTimes(2);

        // Settles after the drain must not reach the stale hook.
        loader.enqueueBatch([SLACK], rankOf);
        loader.startPending();
        loader.onLoadSettled();
        expect(progress).toHaveBeenCalledTimes(2);
    });
});
