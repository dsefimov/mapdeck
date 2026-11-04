import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@core/lib/logger";
import type { CameraSnapshot } from "../geometry";
import { CycleRunner, type CycleInput } from "./CycleRunner";

function input(): CycleInput {
    return {
        cameraSnapshot: {} as CameraSnapshot,
        viewportBounds: [0, 0, 0, 0],
    };
}

describe("CycleRunner", () => {
    beforeEach(() => {
        vi.spyOn(logger, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("recovers after a failing cycle", async () => {
        const runCycle = vi
            .fn<(input: CycleInput, signal: AbortSignal) => Promise<void>>()
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValue(undefined);
        const runner = new CycleRunner(runCycle);

        runner.request(input());
        await vi.waitFor(() => expect(runCycle).toHaveBeenCalledTimes(1));

        runner.request(input());
        await vi.waitFor(() => expect(runCycle).toHaveBeenCalledTimes(2));
    });

    it("runs the pending request after a failing cycle", async () => {
        const runCycle = vi
            .fn<(input: CycleInput, signal: AbortSignal) => Promise<void>>()
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValue(undefined);
        const runner = new CycleRunner(runCycle);

        runner.request(input());
        runner.request(input());

        await vi.waitFor(() => expect(runCycle).toHaveBeenCalledTimes(2));
    });

    it("collapses intermediate requests while a cycle is running", async () => {
        const runCycle = vi
            .fn<(input: CycleInput, signal: AbortSignal) => Promise<void>>()
            .mockResolvedValue(undefined);
        const runner = new CycleRunner(runCycle);

        runner.request(input());
        runner.request(input());
        runner.request(input());

        await vi.waitFor(() => expect(runCycle).toHaveBeenCalledTimes(2));
    });

    it("supersedes a running cycle: the new input aborts the old signal", async () => {
        let releaseFirst: (() => void) | null = null;
        const firstCycle = vi.fn(
            (_input: CycleInput, signal: AbortSignal) =>
                new Promise<void>((resolve) => {
                    releaseFirst = resolve;
                    signal.addEventListener("abort", () => resolve(), {
                        once: true,
                    });
                }),
        );
        const secondCycle = vi.fn().mockResolvedValue(undefined);
        const runCycle = vi
            .fn<(input: CycleInput, signal: AbortSignal) => Promise<void>>()
            .mockImplementationOnce(firstCycle)
            .mockImplementationOnce(secondCycle);
        const runner = new CycleRunner(runCycle);

        runner.request(input());
        await vi.waitFor(() => expect(firstCycle).toHaveBeenCalled());

        // The camera moves while the first cycle is still running.
        runner.request(input());
        await vi.waitFor(() => expect(secondCycle).toHaveBeenCalled());

        const firstSignal = firstCycle.mock.calls[0]![1];
        expect(firstSignal.aborted).toBe(true);
        // The first cycle resolved via the abort — the runner moved on to
        // the second without releaseFirst ever being called.
        expect(releaseFirst).not.toBeNull();
    });

    it("does not abort a signal from an already-finished cycle", async () => {
        const signals: AbortSignal[] = [];
        const runCycle = vi.fn(
            async (_input: CycleInput, signal: AbortSignal) => {
                signals.push(signal);
            },
        );
        const runner = new CycleRunner(runCycle);

        runner.request(input());
        await vi.waitFor(() => expect(runCycle).toHaveBeenCalledTimes(1));
        runner.request(input());
        await vi.waitFor(() => expect(runCycle).toHaveBeenCalledTimes(2));

        // Sequential cycles: the second request arrives after the first
        // completed, so the first signal was never aborted.
        expect(signals[0]!.aborted).toBe(false);
        expect(signals[1]!.aborted).toBe(false);
    });
});
