import { describe, expect, it } from "vitest";
import { AsyncState } from "./AsyncState";

const FAILURE_MESSAGE = "fetch failed";
const ABORT_MESSAGE = "aborted";
const OLD_FAILURE_MESSAGE = "old failure";

const resolveAfter = <T>(value: T, ms = 5): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(value), ms));

const rejectAfter = (message: string, ms = 5): Promise<never> =>
    new Promise((_, reject) =>
        setTimeout(() => reject(new Error(message)), ms),
    );

describe("AsyncState", () => {
    it("transitions to idle on success without an error", async () => {
        const state = new AsyncState();
        const result = await state.run(() => resolveAfter("ok"));
        expect(result).toBe("ok");
        expect(state.status).toBe("idle");
        expect(state.error).toBeNull();
        expect(state.isLoading).toBe(false);
    });

    it("stores the error message on failure", async () => {
        const state = new AsyncState();
        await expect(
            state.run(() => rejectAfter(FAILURE_MESSAGE)),
        ).rejects.toThrow(FAILURE_MESSAGE);
        expect(state.status).toBe("error");
        expect(state.error).toBe(FAILURE_MESSAGE);
        expect(state.isLoading).toBe(false);
    });

    it("clears a previous error when a new run starts", async () => {
        const state = new AsyncState();
        await state
            .run(() => rejectAfter(OLD_FAILURE_MESSAGE))
            .catch(() => undefined);
        expect(state.error).toBe(OLD_FAILURE_MESSAGE);

        const pending = state.run(() => resolveAfter("ok", 20));
        expect(state.status).toBe("loading");
        expect(state.error).toBeNull();
        await pending;
        expect(state.status).toBe("idle");
    });

    it("returns to idle without an error on abort", async () => {
        const state = new AsyncState();
        const controller = new AbortController();
        const run = state.run(
            () => rejectAfter(ABORT_MESSAGE),
            controller.signal,
        );
        controller.abort();
        await expect(run).rejects.toThrow(ABORT_MESSAGE);
        expect(state.status).toBe("idle");
        expect(state.error).toBeNull();
    });

    it("reports loading while an operation is in flight", async () => {
        const state = new AsyncState();
        const pending = state.run(() => resolveAfter("ok", 20));
        expect(state.status).toBe("loading");
        expect(state.isLoading).toBe(true);
        await pending;
        expect(state.isLoading).toBe(false);
    });

    it("reset returns to idle with no error", () => {
        const state = new AsyncState();
        state.status = "error";
        state.error = "boom";
        state.reset();
        expect(state.status).toBe("idle");
        expect(state.error).toBeNull();
    });

    it("ignores the abort of a superseded run", async () => {
        const state = new AsyncState();
        const controller = new AbortController();
        // Run 1 starts, will be aborted after run 2 completes.
        const run1 = state.run(
            () => rejectAfter(ABORT_MESSAGE, 20),
            controller.signal,
        );
        // Run 2 starts later and settles first.
        const run2 = state.run(() => resolveAfter("ok", 5));
        await run2;
        expect(state.status).toBe("idle");

        controller.abort();
        await expect(run1).rejects.toThrow(ABORT_MESSAGE);
        // Run 1's abort must not overwrite run 2's outcome.
        expect(state.status).toBe("idle");
        expect(state.error).toBeNull();
    });

    it("a superseded failure does not set error", async () => {
        const state = new AsyncState();
        const run1 = state.run(() => rejectAfter(OLD_FAILURE_MESSAGE, 15));
        const run2 = state.run(() => resolveAfter("ok", 5));
        await run2;
        await expect(run1).rejects.toThrow(OLD_FAILURE_MESSAGE);
        expect(state.status).toBe("idle");
        expect(state.error).toBeNull();
    });
});
