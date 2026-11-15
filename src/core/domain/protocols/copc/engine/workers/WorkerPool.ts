type PendingRequest = {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    /** Disarms the request's timeout timer — set when the request dispatches. */
    disarm: () => void;
};

type QueuedItem = {
    data: unknown;
    transfer: Transferable[];
    requestId: string;
    /** Dispatch order: lower value runs first; equal values stay FIFO. */
    priority: number;
};

/**
 * Fixed-size worker pool: posts requests to a free worker, queues the rest.
 * The queue is a priority queue — interactive work (a visible node's
 * recolor) jumps ahead of bulk work instead of waiting behind a load burst.
 *
 * Every dispatched request carries a time ceiling — a worker wedged mid-decode
 * is terminated and respawned so its slot recovers instead of stalling the
 * pool. `dispose` rejects everything still pending: callers fail fast instead
 * of awaiting a pool that will never answer.
 */
export class WorkerPool {
    private _workers: Worker[] = [];
    private _queue: QueuedItem[] = [];
    private _pending = new Map<string, PendingRequest>();
    private _workerBusy: boolean[] = [];
    private _workerCurrentRequest: (string | null)[] = [];
    private _requestCounter = 0;
    private readonly _createWorker: () => Worker;
    private readonly _requestTimeoutMs: number | undefined;

    constructor(
        createWorker: () => Worker,
        poolSize: number,
        requestTimeoutMs?: number,
    ) {
        this._createWorker = createWorker;
        this._requestTimeoutMs = requestTimeoutMs;
        for (let i = 0; i < poolSize; i++) {
            this._spawn(i);
        }
    }

    post<TReq extends object, TRes>(
        data: TReq,
        transfer: Transferable[],
        priority = 1,
    ): Promise<TRes> {
        const requestId = String(++this._requestCounter);
        const payload = { ...data, requestId };

        return new Promise<TRes>((resolve, reject) => {
            if (this._workers.length === 0) {
                reject(new Error("WorkerPool disposed"));
                return;
            }
            this._pending.set(requestId, {
                resolve: resolve as (r: unknown) => void,
                reject,
                disarm: () => {},
            });

            const freeIdx = this._workerBusy.findIndex((busy) => !busy);
            if (freeIdx !== -1) {
                this._dispatch(freeIdx, payload, transfer, requestId);
            } else {
                this._queue.push({ data: payload, transfer, requestId, priority });
            }
        });
    }

    dispose(): void {
        const disposed = new Error("WorkerPool disposed");
        for (const [, pending] of this._pending) {
            pending.disarm();
            pending.reject(disposed);
        }
        this._pending.clear();
        this._queue = [];
        for (const w of this._workers) {
            w.terminate();
        }
        this._workers = [];
        this._workerBusy = [];
        this._workerCurrentRequest = [];
    }

    private _spawn(workerIdx: number): void {
        const w = this._createWorker();
        w.onmessage = (e) => this._onResult(workerIdx, e.data);
        w.onerror = (e) => this._onError(workerIdx, e);
        this._workers[workerIdx] = w;
        this._workerBusy[workerIdx] = false;
        this._workerCurrentRequest[workerIdx] = null;
    }

    private _dispatch(
        workerIdx: number,
        data: unknown,
        transfer: Transferable[],
        requestId: string,
    ): void {
        this._workerBusy[workerIdx] = true;
        this._workerCurrentRequest[workerIdx] = requestId;
        this._armTimeout(workerIdx, requestId);
        this._workers[workerIdx]!.postMessage(data, transfer);
    }

    private _armTimeout(workerIdx: number, requestId: string): void {
        if (this._requestTimeoutMs === undefined) return;
        const timeoutMs = this._requestTimeoutMs;
        const timer = setTimeout(() => {
            const pending = this._pending.get(requestId);
            if (!pending) return;
            this._pending.delete(requestId);
            pending.reject(
                new Error(`Worker request timed out after ${timeoutMs}ms`),
            );
            // A wedged worker cannot be trusted with the next request, and
            // terminate stops its late results too — the slot recovers with
            // a fresh instance.
            this._workers[workerIdx]?.terminate();
            this._spawn(workerIdx);
            this._drainQueue(workerIdx);
        }, timeoutMs);
        this._pending.get(requestId)!.disarm = () => clearTimeout(timer);
    }

    private _onResult(workerIdx: number, result: { requestId: string }): void {
        const pending = this._pending.get(result.requestId);
        if (!pending) {
            // A late result racing the timeout — freeing the respawned
            // slot here would double-book it.
            return;
        }
        this._pending.delete(result.requestId);
        pending.disarm();
        this._workerBusy[workerIdx] = false;
        this._workerCurrentRequest[workerIdx] = null;
        if (
            "kind" in result &&
            (result as { kind?: string }).kind === "error"
        ) {
            // The request failed inside the worker (e.g. a decode
            // error) — surface it as a rejection instead of waiting
            // for the timeout to reap the slot.
            pending.reject(
                new Error(
                    (result as { message?: string }).message ??
                        "worker error",
                ),
            );
        } else {
            pending.resolve(result);
        }
        this._drainQueue(workerIdx);
    }

    private _onError(workerIdx: number, e: ErrorEvent): void {
        const requestId = this._workerCurrentRequest[workerIdx];
        if (requestId) {
            const pending = this._pending.get(requestId);
            this._pending.delete(requestId);
            pending?.disarm();
            pending?.reject(new Error(`Worker error: ${e.message}`));
            this._workerCurrentRequest[workerIdx] = null;
        }
        // An erroring worker cannot be trusted with the next request —
        // respawn instead of burning a timeout per future dispatch.
        this._workers[workerIdx]?.terminate();
        this._spawn(workerIdx);
        this._drainQueue(workerIdx);
    }

    private _drainQueue(workerIdx: number): void {
        // The queue is small (in-flight node loads plus bounded recolor
        // chunks) — a linear scan for the lowest priority is cheaper than
        // keeping it sorted on insert.
        let nextIdx = -1;
        for (let i = 0; i < this._queue.length; i++) {
            if (
                nextIdx === -1 ||
                this._queue[i]!.priority < this._queue[nextIdx]!.priority
            ) {
                nextIdx = i;
            }
        }
        const next =
            nextIdx === -1 ? undefined : this._queue.splice(nextIdx, 1)[0];
        if (next) {
            this._dispatch(workerIdx, next.data, next.transfer, next.requestId);
        }
    }
}
