type PendingRequest = {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
};

type QueuedItem = {
    data: unknown;
    transfer: Transferable[];
    requestId: string;
};

export class WorkerPool {
    private _workers: Worker[] = [];
    private _queue: QueuedItem[] = [];
    private _pending = new Map<string, PendingRequest>();
    private _workerBusy: boolean[] = [];
    private _workerCurrentRequest: (string | null)[] = [];
    private _requestCounter = 0;

    constructor(
        createWorker: () => Worker,
        private _poolSize: number,
    ) {
        for (let i = 0; i < _poolSize; i++) {
            const w = createWorker();
            w.onmessage = (e) => this._onResult(i, e.data);
            w.onerror = (e) => this._onError(i, e);
            this._workers.push(w);
            this._workerBusy.push(false);
            this._workerCurrentRequest.push(null);
        }
    }

    get size(): number {
        return this._poolSize;
    }

    get activeRequests(): number {
        return this._workerBusy.filter((busy) => busy).length;
    }

    post<TReq extends object, TRes>(
        data: TReq,
        transfer: Transferable[],
    ): Promise<TRes> {
        const requestId = String(++this._requestCounter);
        const payload = { ...data, requestId };

        return new Promise<TRes>((resolve, reject) => {
            this._pending.set(requestId, {
                resolve: resolve as (r: unknown) => void,
                reject,
            });

            const freeIdx = this._workerBusy.findIndex((busy) => !busy);
            if (freeIdx !== -1) {
                this._dispatch(freeIdx, payload, transfer, requestId);
            } else {
                this._queue.push({ data: payload, transfer, requestId });
            }
        });
    }

    private _dispatch(
        workerIdx: number,
        data: unknown,
        transfer: Transferable[],
        requestId: string,
    ): void {
        this._workerBusy[workerIdx] = true;
        this._workerCurrentRequest[workerIdx] = requestId;
        this._workers[workerIdx]!.postMessage(data, transfer);
    }

    private _onResult(workerIdx: number, result: { requestId: string }): void {
        const pending = this._pending.get(result.requestId);
        this._pending.delete(result.requestId);
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

    dispose(): void {
        for (const w of this._workers) {
            w.terminate();
        }
        this._workers = [];
        this._pending.clear();
        this._queue = [];
        this._workerBusy = [];
    }
}
