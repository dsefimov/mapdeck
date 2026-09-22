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
};

/**
 * Fixed-size worker pool: posts requests to a free worker, queues the rest.
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
                this._queue.push({ data: payload, transfer, requestId });
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
        this._pending.delete(result.requestId);
        pending?.disarm();
        this._workerBusy[workerIdx] = false;
        this._workerCurrentRequest[workerIdx] = null;
        if (pending) {
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
        this._workerBusy[workerIdx] = false;
        this._drainQueue(workerIdx);
    }

    private _drainQueue(workerIdx: number): void {
        const next = this._queue.shift();
        if (next) {
            this._dispatch(workerIdx, next.data, next.transfer, next.requestId);
        }
    }
}
