import type { CachedNode } from "@core/framework/types";
import { MinHeap } from "@core/shared/async/MinHeap";
import type { NodeMetadataRegistry } from "../metadata/NodeMetadataRegistry";

/** Callback to actually load a single node. */
export type LoadNodeFn = (node: CachedNode) => Promise<void>;

/**
 * Manages the loading queue: priority heap, concurrent request limiting,
 * stale cancellation, error retry, and drain signaling.
 */
export class NodeLoader {
    private readonly _queue = new MinHeap<CachedNode>(
        (a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity),
    );
    private _activeRequests = 0;
    private readonly _errorKeys = new Set<string>();
    private _drainResolve: (() => void) | null = null;

    constructor(
        private readonly _nodeCache: ReadonlyMap<string, CachedNode>,
        private readonly _metadata: NodeMetadataRegistry,
        private readonly _maxConcurrentRequests: number,
        private readonly _loadNode: LoadNodeFn,
    ) {}

    get activeRequests(): number {
        return this._activeRequests;
    }

    get queueSize(): number {
        return this._queue.size;
    }

    /** Exposed for eviction — clearTileData removes from this set. */
    get errorKeys(): Set<string> {
        return this._errorKeys;
    }

    /** Add a node to the priority queue. Resets error state if applicable. */
    enqueueOne(node: CachedNode): void {
        if (node.state !== "pending" && node.state !== "error") return;
        if (node.retryAt && Date.now() < node.retryAt) return;

        if (node.state === "error") {
            node.state = "pending";
            delete node.error;
        }

        this._queue.push(node);
    }

    /** Start up to maxConcurrentRequests parallel loads from the queue. */
    startPending(): void {
        while (
            this._queue.size > 0 &&
            this._activeRequests < this._maxConcurrentRequests
        ) {
            const node = this._queue.pop()!;
            this._activeRequests++;
            void this._loadNode(node);
        }
    }

    /** Called by the loader when a load settles. */
    onLoadSettled(): void {
        this._activeRequests--;
        this._signalDrainCheck();
        this.startPending();
    }

    /**
     * Enqueue a batch of node keys with abort controllers and priority.
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

            let meta = this._metadata.load.get(node);
            if (!meta) {
                meta = {};
                this._metadata.load.set(node, meta);
            }
            meta.loadController = new AbortController();

            node.priority = getPriority(key);
            this.enqueueOne(node);
            count++;
        }
        return count;
    }

    /**
     * Cancel in-flight requests and queued loads for nodes not in keepKeys.
     * State is reset to "pending" immediately after abort.
     */
    cancelStale(
        keepKeys: Set<string>,
        onAbort?: (node: CachedNode) => void,
    ): void {
        // Abort in-flight loads not in keepKeys.
        for (const [, node] of this._nodeCache) {
            const meta = this._metadata.load.get(node);
            if (meta?.loadController && node.state === "loading") {
                if (keepKeys.has(node.key)) continue;
                meta.loadController.abort();
                node.state = "pending";
                onAbort?.(node);
            }
        }

        // Purge stale entries from the queue.
        const allQueued: CachedNode[] = [];
        while (this._queue.size > 0) {
            allQueued.push(this._queue.pop()!);
        }
        for (const node of allQueued) {
            if (keepKeys.has(node.key)) {
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
     * Drain the loading queue. Returns a Promise that resolves when
     * all in-flight requests complete and the queue is empty.
     */
    async drain(): Promise<void> {
        this.requeueExpiredErrors();
        this.startPending();

        if (this._activeRequests === 0 && this._queue.size === 0) {
            return;
        }

        return new Promise<void>((resolve) => {
            this._drainResolve = resolve;
            this._signalDrainCheck();
        });
    }

    private _signalDrainCheck(): void {
        if (!this._drainResolve) return;
        if (this._activeRequests === 0 && this._queue.size === 0) {
            const resolve = this._drainResolve;
            this._drainResolve = null;
            resolve();
        }
    }
}
