import type { CachedNode } from "../types";
import { MinHeap } from "@core/lib/async/MinHeap";

/**
 * Callback to actually load a single node. The signal aborts together with
 * the load's claim on the node — cancelStale triggers it.
 */
export type LoadNodeFn = (
    node: CachedNode,
    signal: AbortSignal,
) => Promise<void>;

/**
 * Manages the loading queue: priority heap, concurrent request limiting,
 * stale cancellation, error retry, and drain signaling.
 *
 * A node key is queued, in flight, or neither — never twice. The in-flight
 * map owns one AbortController per dispatched load; cancelStale aborts loads
 * the camera no longer wants instead of letting them finish onto a reset
 * state, which used to start a second parallel load for the same node.
 */
export class NodeLoader {
    private readonly _queue = new MinHeap<CachedNode>(
        (a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity),
    );
    /** Mirrors the heap so a key can never enter it twice. */
    private readonly _queuedKeys = new Set<string>();
    /** One AbortController per dispatched load, keyed by node key. */
    private readonly _inFlight = new Map<string, AbortController>();
    private _activeRequests = 0;
    private readonly _errorKeys = new Set<string>();
    private _drainResolve: (() => void) | null = null;
    private _onDrainProgress: (() => void) | null = null;
    private _loadStamp = 0;

    constructor(
        private readonly _nodeCache: ReadonlyMap<string, CachedNode>,
        private readonly _maxConcurrentRequests: number,
        private readonly _loadNode: LoadNodeFn,
    ) {}

    /**
     * Monotonically increasing count of settled loads — lets the renderer
     * detect newly arrived data even when the visible key set is unchanged
     * (progressive rendering during a cycle).
     */
    get loadStamp(): number {
        return this._loadStamp;
    }

    /** Exposed for eviction — clearTileData removes from this set. */
    get errorKeys(): Set<string> {
        return this._errorKeys;
    }

    /**
     * Add a node to the priority queue. Resets error state if applicable.
     * Returns false for keys already queued or in flight.
     */
    enqueueOne(node: CachedNode): boolean {
        if (this._inFlight.has(node.key)) return false;
        if (this._queuedKeys.has(node.key)) return false;
        if (node.state !== "pending" && node.state !== "error") return false;
        if (node.retryAt && Date.now() < node.retryAt) return false;

        if (node.state === "error") {
            node.state = "pending";
            delete node.error;
        }

        this._queuedKeys.add(node.key);
        this._queue.push(node);
        return true;
    }

    /** Start up to maxConcurrentRequests parallel loads from the queue. */
    startPending(): void {
        while (
            this._queue.size > 0 &&
            this._activeRequests < this._maxConcurrentRequests
        ) {
            const node = this._queue.pop()!;
            this._queuedKeys.delete(node.key);
            // Defensive: the paired sets keep duplicates out of the heap, but
            // a stale entry here must not consume a concurrency slot.
            if (this._inFlight.has(node.key)) continue;
            this._dispatch(node);
        }
    }

    /** Called by the loader when a load settles. */
    onLoadSettled(): void {
        this._activeRequests--;
        this._loadStamp++;
        this._onDrainProgress?.();
        this._signalDrainCheck();
        this.startPending();
    }

    /**
     * Enqueue a batch of node keys with priority.
     *
     * `getPriority` returns the traversal's load rank for a key, where a lower
     * value is more urgent — the queue is a min-heap, so it hands out the
     * lowest rank first. Negating the rank on the way in reverses the whole
     * loading order.
     *
     * Returns the number of nodes actually enqueued.
     */
    enqueueBatch(keys: string[], getPriority: (key: string) => number): number {
        let count = 0;
        for (const key of keys) {
            const node = this._nodeCache.get(key);
            if (!node || node.state === "loading" || node.state === "loaded") {
                continue;
            }
            if (node.retryAt && Date.now() < node.retryAt) continue;

            node.priority = getPriority(key);
            if (this.enqueueOne(node)) count++;
        }
        return count;
    }

    /**
     * Cancel queued loads for nodes not in keepKeys and abort in-flight ones.
     * A load whose node leaves "loading" discards its result on settle;
     * aborting the request releases its concurrency slot at once instead of
     * waiting for a response the cycle no longer wants. `onAbort` reports
     * each reset.
     */
    cancelStale(
        keepKeys: Set<string>,
        onAbort?: (node: CachedNode) => void,
    ): void {
        // Abort in-flight loads not in keepKeys; their results are discarded.
        for (const [, node] of this._nodeCache) {
            if (node.state !== "loading") continue;
            if (keepKeys.has(node.key)) continue;
            node.state = "pending";
            this._inFlight.get(node.key)?.abort();
            onAbort?.(node);
        }

        this._queuedKeys.clear();
        const allQueued: CachedNode[] = [];
        while (this._queue.size > 0) {
            allQueued.push(this._queue.pop()!);
        }
        for (const node of allQueued) {
            if (keepKeys.has(node.key)) {
                this._queuedKeys.add(node.key);
                this._queue.push(node);
            } else {
                node.state = "pending";
            }
        }
    }

    /**
     * Re-enqueue expired error nodes. Limited to maxConcurrentRequests per call.
     */
    requeueExpiredErrors(): void {
        const now = Date.now();
        let enqueued = 0;

        for (const key of this._errorKeys) {
            if (enqueued >= this._maxConcurrentRequests) break;

            const node = this._nodeCache.get(key);
            if (!node || node.state !== "error") {
                this._errorKeys.delete(key);
                continue;
            }
            if (node.retryAt != null && now >= node.retryAt) {
                node.state = "pending";
                delete node.error;
                this._errorKeys.delete(key);
                this._queuedKeys.add(node.key);
                this._queue.push(node);
                enqueued++;
            }
        }
    }

    /** Record a node in error state for later retry. */
    addErrorNode(key: string): void {
        this._errorKeys.add(key);
    }

    /**
     * Full stop for teardown: abort every in-flight load, drop the queue,
     * and release a pending drain — nothing new starts from here.
     */
    cancelAll(): void {
        for (const [, controller] of this._inFlight) controller.abort();
        this._inFlight.clear();
        while (this._queue.size > 0) this._queue.pop();
        this._queuedKeys.clear();
        for (const [, node] of this._nodeCache) {
            if (node.state === "loading") node.state = "pending";
        }
        const resolve = this._drainResolve;
        this._drainResolve = null;
        this._onDrainProgress = null;
        resolve?.();
    }

    /**
     * Drain the loading queue. Returns a Promise that resolves when
     * all in-flight requests complete and the queue is empty.
     *
     * `onProgress` fires after each load settles while draining — the
     * progressive-render hook; it is cleared once the drain resolves.
     */
    async drain(onProgress?: () => void): Promise<void> {
        this.requeueExpiredErrors();
        this.startPending();

        if (this._activeRequests === 0 && this._queue.size === 0) {
            return;
        }

        return new Promise<void>((resolve) => {
            this._drainResolve = resolve;
            this._onDrainProgress = onProgress ?? null;
            this._signalDrainCheck();
        });
    }

    private _dispatch(node: CachedNode): void {
        const controller = new AbortController();
        this._inFlight.set(node.key, controller);
        this._activeRequests++;
        void this._loadNode(node, controller.signal).finally(() => {
            this._inFlight.delete(node.key);
        });
    }

    private _signalDrainCheck(): void {
        if (!this._drainResolve) return;
        if (this._activeRequests === 0 && this._queue.size === 0) {
            const resolve = this._drainResolve;
            this._drainResolve = null;
            this._onDrainProgress = null;
            resolve();
        }
    }
}
