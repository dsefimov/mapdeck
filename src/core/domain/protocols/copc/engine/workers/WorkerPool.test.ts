import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerPool } from "./WorkerPool";

const TIMEOUT_MS = 20_000;
const DISPOSED_MSG = "WorkerPool disposed";

/**
 * Duck-typed worker: the pool only needs postMessage/terminate and the two
 * event handlers. `respond` simulates the worker posting a result back.
 */
class FakeWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    posted: { data: Record<string, unknown> }[] = [];
    terminated = false;

    postMessage(data: unknown): void {
        this.posted.push({ data: data as Record<string, unknown> });
    }

    terminate(): void {
        this.terminated = true;
    }

    respond(requestId: string, payload: Record<string, unknown>): void {
        this.onmessage?.({ data: { ...payload, requestId } });
    }
}

interface Harness {
    pool: WorkerPool;
    workers: FakeWorker[];
}

function harness(
    poolSize = 1,
    requestTimeoutMs: number | undefined = TIMEOUT_MS,
): Harness {
    const workers: FakeWorker[] = [];
    const pool = new WorkerPool(
        () => {
            const w = new FakeWorker();
            workers.push(w);
            return w as unknown as Worker;
        },
        poolSize,
        requestTimeoutMs,
    );
    return { pool, workers };
}

function lastRequest(worker: FakeWorker): { requestId: string } {
    return worker.posted[worker.posted.length - 1]!.data as {
        requestId: string;
    };
}

describe("WorkerPool", () => {
    it("resolves a post with the worker's result", async () => {
        const { pool, workers } = harness();

        const posted = pool.post<{ kind: string }, { kind: string; n: number }>(
            { kind: "decode" },
            [],
        );
        workers[0]!.respond(lastRequest(workers[0]!).requestId, { n: 7 });

        await expect(posted).resolves.toMatchObject({ n: 7 });
    });

    it("queues a second request until the worker frees up", async () => {
        const { pool, workers } = harness(1);

        const first = pool.post({ kind: "a" }, []);
        const second = pool.post({ kind: "b" }, []);

        expect(workers[0]!.posted).toHaveLength(1);
        workers[0]!.respond(lastRequest(workers[0]!).requestId, {});
        await first;
        expect(workers[0]!.posted).toHaveLength(2);
        workers[0]!.respond(lastRequest(workers[0]!).requestId, {});
        await second;
    });

    it("rejects on a worker error result instead of hanging the slot", async () => {
        const { pool, workers } = harness(1);

        const posted = pool.post({ kind: "process" }, []);
        workers[0]!.respond(lastRequest(workers[0]!).requestId, {
            kind: "error",
            message: "decode failed",
        });

        await expect(posted).rejects.toThrow("decode failed");
        // The slot recovered — the next request dispatches immediately.
        const next = pool.post({ kind: "again" }, []);
        expect(workers[0]!.posted).toHaveLength(2);
        workers[0]!.respond(lastRequest(workers[0]!).requestId, {});
        await next;
    });
});

describe("WorkerPool priority dispatch", () => {
    it("dispatches the lowest priority first when a worker frees up", async () => {
        const { pool, workers } = harness(1);

        const first = pool.post({ kind: "first" }, []);
        const bulk = pool.post({ kind: "bulk" }, [], 2);
        const normal = pool.post({ kind: "normal" }, [], 1);
        const interactive = pool.post({ kind: "interactive" }, [], 0);

        const dispatched: string[] = [];
        const settleNext = (): void => {
            const req = workers[0]!.posted.at(-1)!.data as {
                kind: string;
                requestId: string;
            };
            dispatched.push(req.kind);
            workers[0]!.respond(req.requestId, {});
        };

        settleNext();
        await first;
        settleNext();
        await interactive;
        settleNext();
        await normal;
        settleNext();
        await bulk;

        expect(dispatched).toEqual(["first", "interactive", "normal", "bulk"]);
    });

    it("keeps FIFO order within one priority", async () => {
        const { pool, workers } = harness(1);

        const first = pool.post({ kind: "first" }, []);
        const second = pool.post({ kind: "bulk-early" }, [], 2);
        const third = pool.post({ kind: "bulk-late" }, [], 2);

        workers[0]!.respond(lastRequest(workers[0]!).requestId, {});
        await first;
        // The earlier bulk job won the slot, not the later one.
        expect(
            (workers[0]!.posted[1]!.data as { kind: string }).kind,
        ).toBe("bulk-early");
        workers[0]!.respond(lastRequest(workers[0]!).requestId, {});
        await second;

        expect(
            (workers[0]!.posted[2]!.data as { kind: string }).kind,
        ).toBe("bulk-late");
        workers[0]!.respond(lastRequest(workers[0]!).requestId, {});
        await third;
    });
});

describe("WorkerPool request timeout", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("rejects a wedged request and recovers the slot with a fresh worker", async () => {
        const { pool, workers } = harness(1);

        const posted = pool.post({ kind: "decode" }, []);
        const hung = expect(posted).rejects.toThrow(/timed out/);

        vi.advanceTimersByTime(TIMEOUT_MS + 1);
        await hung;

        expect(workers[0]!.terminated).toBe(true);
        expect(workers).toHaveLength(2);

        const next = pool.post({ kind: "again" }, []);
        workers[1]!.respond(lastRequest(workers[1]!).requestId, {});
        await expect(next).resolves.toBeDefined();
    });

    it("keeps a settled request's timer from firing late", async () => {
        const { pool, workers } = harness(1);

        const posted = pool.post({ kind: "decode" }, []);
        workers[0]!.respond(lastRequest(workers[0]!).requestId, {});
        await posted;

        vi.advanceTimersByTime(TIMEOUT_MS * 2);
        expect(workers[0]!.terminated).toBe(false);
        expect(workers).toHaveLength(1);
    });

    it("ignores a late result racing the timeout — the slot stays booked", async () => {
        const { pool, workers } = harness(1);

        const hung = pool.post({ kind: "decode" }, []);
        const hungId = lastRequest(workers[0]!).requestId;
        const timedOut = expect(hung).rejects.toThrow(/timed out/);
        vi.advanceTimersByTime(TIMEOUT_MS + 1);
        await timedOut;
        expect(workers).toHaveLength(2); // respawn took the slot

        // The replacement request occupies the respawned worker…
        const next = pool.post({ kind: "next" }, []);
        expect(workers[1]!.posted).toHaveLength(1);

        // …and the reaped request's late result must not free the busy slot.
        pool.post({ kind: "queued" }, []);
        workers[0]!.respond(hungId, {});
        expect(workers[1]!.posted).toHaveLength(1);

        workers[1]!.respond(lastRequest(workers[1]!).requestId, {});
        await next;
        expect(workers[1]!.posted).toHaveLength(2); // queued dispatched only now
        workers[1]!.respond(lastRequest(workers[1]!).requestId, {});
    });
});

describe("WorkerPool worker error", () => {
    it("rejects the request and recovers the slot with a fresh worker", async () => {
        const { pool, workers } = harness(1);

        const posted = pool.post({ kind: "decode" }, []);
        const failed = expect(posted).rejects.toThrow(
            "Worker error: boom",
        );

        workers[0]!.onerror?.({ message: "boom" } as ErrorEvent);
        await failed;

        expect(workers[0]!.terminated).toBe(true);
        expect(workers).toHaveLength(2);

        const next = pool.post({ kind: "again" }, []);
        expect(workers[1]!.posted).toHaveLength(1);
        workers[1]!.respond(lastRequest(workers[1]!).requestId, {});
        await expect(next).resolves.toBeDefined();
    });
});

describe("WorkerPool.dispose", () => {
    it("rejects everything still pending and terminates the workers", async () => {
        const { pool, workers } = harness(1);

        const inFlight = pool.post({ kind: "a" }, []);
        const queued = pool.post({ kind: "b" }, []);

        pool.dispose();

        await expect(inFlight).rejects.toThrow(DISPOSED_MSG);
        await expect(queued).rejects.toThrow(DISPOSED_MSG);
        expect(workers[0]!.terminated).toBe(true);
    });

    it("rejects posts made after disposal instead of hanging", async () => {
        const { pool } = harness(1);
        pool.dispose();

        await expect(pool.post({ kind: "late" }, [])).rejects.toThrow(
            DISPOSED_MSG,
        );
    });
});
