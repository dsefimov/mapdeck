import { makeAutoObservable, runInAction } from "mobx";

/**
 * Statuses of a single asynchronous operation.
 * Const-object + union: runtime constants avoid duplicated literals, while the
 * derived type stays structural — plain strings remain assignable.
 */
export const AsyncStatusValues = {
    Idle: "idle",
    Loading: "loading",
    Error: "error",
} as const;

export type AsyncStatus =
    (typeof AsyncStatusValues)[keyof typeof AsyncStatusValues];

/**
 * State of a single asynchronous operation: status plus an optional error
 * message. Observable so UI can react to `isLoading`/`error`.
 *
 * `run` clears the error at the start of every run (a retry never inherits a
 * previous failure), and an abort returns the state to `idle` without setting
 * an error.
 */
export class AsyncState {
    status: AsyncStatus = AsyncStatusValues.Idle;
    error: string | null = null;

    /** Generation counter — invalidates the outcomes of superseded runs. */
    private _runId = 0;

    constructor() {
        makeAutoObservable<this, "_runId">(this, { _runId: false });
    }

    get isLoading(): boolean {
        return this.status === "loading";
    }

    /**
     * Run `fn`, tracking the outcome in this state. The promise is rethrown on
     * failure so the caller can react; an aborted run settles at `idle` with
     * `error` still `null`.
     *
     * Outcomes of superseded runs are ignored: when a newer `run` starts (or
     * `reset` is called), an older in-flight run can no longer write status or
     * error, so it cannot clobber a newer run's state.
     */
    async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
        const runId = ++this._runId;
        this.status = AsyncStatusValues.Loading;
        this.error = null;
        try {
            const result = await fn();
            runInAction(() => {
                if (runId === this._runId) {
                    this.status = AsyncStatusValues.Idle;
                }
            });
            return result;
        } catch (e) {
            runInAction(() => {
                if (runId === this._runId) {
                    if (signal?.aborted) {
                        this.status = AsyncStatusValues.Idle;
                    } else {
                        this.status = AsyncStatusValues.Error;
                        this.error = e instanceof Error ? e.message : String(e);
                    }
                }
            });
            throw e;
        }
    }

    /** Reset to the idle state with no error; invalidates in-flight runs. */
    reset(): void {
        this._runId++;
        this.status = AsyncStatusValues.Idle;
        this.error = null;
    }
}
