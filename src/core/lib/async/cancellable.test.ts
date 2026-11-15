import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger";
import { createCancellableTask } from "./cancellable";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("createCancellableTask", () => {
    it("runs the task and exposes its signal", async () => {
        const task = createCancellableTask();
        const seen: AbortSignal[] = [];

        await task.run(async (signal) => {
            seen.push(signal);
        });

        expect(seen).toHaveLength(1);
        expect(seen[0]).toBe(task.signal);
    });

    it("swallows a rejection after cancel — the cancellation is expected", async () => {
        const debug = vi.spyOn(logger, "debug").mockImplementation(() => {});
        const task = createCancellableTask();
        const error = new Error("aborted work");

        const done = task.run(async () => {
            task.cancel();
            throw error;
        });

        await expect(done).resolves.toBeUndefined();
        expect(debug).toHaveBeenCalled();
    });

    it("returns the task's value, undefined only when cancelled", async () => {
        const task = createCancellableTask();

        await expect(task.run(async () => "payload")).resolves.toBe(
            "payload",
        );
    });

    it("rethrows an error that is not a cancellation", async () => {
        const boom = new Error("real failure");
        const task = createCancellableTask();

        await expect(
            task.run(async () => {
                throw boom;
            }),
        ).rejects.toBe(boom);
    });
});
