import { LoopState } from "../../types";
import { logger } from "@core/lib/logger";
import type { CameraSnapshot } from "../geometry";

/** Input for a single FSM cycle. */
export interface CycleInput {
    cameraSnapshot: CameraSnapshot;
    viewportBounds: [number, number, number, number];
}

/**
 * FSM driver for request-cycle execution.
 * Collapses intermediate inputs: if a cycle is already running,
 * the latest pending input runs exactly once after it completes.
 */
export class CycleRunner {
    private _state: LoopState = LoopState.Idle;
    private _pending: CycleInput | null = null;
    private readonly _runCycle: (input: CycleInput) => Promise<void>;

    constructor(runCycle: (input: CycleInput) => Promise<void>) {
        this._runCycle = runCycle;
    }

    request(input: CycleInput): void {
        this._pending = input;
        if (this._state === LoopState.Idle) {
            void this._runNext();
        } else {
            this._state = LoopState.Dirty;
        }
    }

    private async _runNext(): Promise<void> {
        if (!this._pending) {
            this._state = LoopState.Idle;
            return;
        }
        this._state = LoopState.Running;
        const input = this._pending;
        this._pending = null;

        try {
            await this._runCycle(input);
        } catch (error) {
            logger.error("CycleRunner: cycle failed:", error);
        }

        // Re-read — _state may have been mutated by request() during the await.
        if (this._isDirty()) {
            await this._runNext();
        } else {
            this._state = LoopState.Idle;
        }
    }

    private _isDirty(): boolean {
        return this._state === LoopState.Dirty;
    }
}
