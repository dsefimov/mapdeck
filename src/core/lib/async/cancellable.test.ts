import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@core/lib/logger";
import { createCancellable } from "./cancellable";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("createCancellable", () => {
    it("runs the task and exposes its signal", async () => {
        const task = createCancellable();
        const seen: AbortSignal[] = [];

        await task.run(async (signal) => {
            seen.push(signal);
        });

        expect(seen).toHaveLength(1);
        expect(seen[0]).toBe(task.signal);
    });

    it("swallows a rejection after cancel — the cancellation is expected", async () => {
        const debug = vi.spyOn(logger, "debug").mockImplementation(() => {});
        const task = createCancellable();
        const error = new Error("aborted work");

        const done = task.run(async () => {
            task.cancel();
            throw error;
        });

        await expect(done).resolves.toBeUndefined();
        expect(debug).toHaveBeenCalled();
    });

    it("rethrows an error that is not a cancellation", async () => {
        const boom = new Error("real failure");
        const task = createCancellable();

        await expect(
            task.run(async () => {
                throw boom;
            }),
        ).rejects.toBe(boom);
    });
});
