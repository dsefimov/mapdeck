import { describe, expect, it, vi, afterEach } from "vitest";

import { createCancellableReaction } from "./cancellableReaction";
import { logger } from "@core/lib/logger";
import { runInAction, observable } from "mobx";

function flushMicrotasks(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("createCancellableReaction", () => {
    it("keeps a failing effect off the global unhandledrejection handler", async () => {
        const unhandled: unknown[] = [];
        const collector = (reason: unknown): void => {
            unhandled.push(reason);
        };
        process.on("unhandledRejection", collector);

        const errorSpy = vi.spyOn(logger, "error");
        const state = observable.box(0);
        const { reaction } = createCancellableReaction<number>(
            () => state.get(),
            async () => {
                throw new Error("boom");
            },
        );

        runInAction(() => state.set(1));
        await flushMicrotasks();

        expect(unhandled).toEqual([]);
        // Non-abort failures are logged exactly once by CancellableTask.run.
        expect(errorSpy).toHaveBeenCalledTimes(1);

        reaction();
        process.off("unhandledRejection", collector);
    });

    it("aborts the previous task's signal when the tracked value changes", () => {
        const state = observable.box(0);
        const signals: AbortSignal[] = [];
        const { reaction } = createCancellableReaction<number>(
            () => state.get(),
            async (_value, signal) => {
                signals.push(signal);
            },
        );

        runInAction(() => state.set(1));
        runInAction(() => state.set(2));

        expect(signals).toHaveLength(2);
        // The re-run cancelled the superseded task's signal.
        expect(signals[0]!.aborted).toBe(true);
        expect(signals[1]!.aborted).toBe(false);
        reaction();
    });
});
