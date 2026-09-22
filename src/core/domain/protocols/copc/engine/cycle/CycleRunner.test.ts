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
            .fn<(input: CycleInput) => Promise<void>>()
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
            .fn<(input: CycleInput) => Promise<void>>()
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValue(undefined);
        const runner = new CycleRunner(runCycle);

        runner.request(input());
        runner.request(input());

        await vi.waitFor(() => expect(runCycle).toHaveBeenCalledTimes(2));
    });

    it("collapses intermediate requests while a cycle is running", async () => {
        const runCycle = vi
            .fn<(input: CycleInput) => Promise<void>>()
            .mockResolvedValue(undefined);
        const runner = new CycleRunner(runCycle);

        runner.request(input());
        runner.request(input());
        runner.request(input());

        await vi.waitFor(() => expect(runCycle).toHaveBeenCalledTimes(2));
    });
});
