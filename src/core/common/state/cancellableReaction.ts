import {
    reaction,
    type IReactionDisposer,
    type IReactionOptions,
} from "mobx";
import { createCancellable, type CancellableTask } from "@core/lib/async";
import { logger } from "@core/lib/logger";

export interface CancellableReactionResult {
    reaction: IReactionDisposer;
    getCurrentTask: () => CancellableTask | null;
}

/**
 * Creates a MobX reaction that supports async cancellation.
 * Each time the reaction fires, the previous async task is cancelled
 * before the new one starts.
 *
 * @param expression - Function that returns the value to track
 * @param effect - Async function to run when the value changes (receives AbortSignal)
 * @param options - MobX reaction options
 */
export function createCancellableReaction<T>(
    expression: () => T,
    effect: (value: T, signal: AbortSignal) => Promise<void>,
    options?: IReactionOptions<T, never>,
): CancellableReactionResult {
    let currentTask: CancellableTask | null = null;

    const reactionDisposer = reaction(
        expression,
        (value) => {
            if (currentTask) {
                currentTask.cancel();
            }
            currentTask = createCancellable();
            // run() logs non-abort failures before rejecting; the catch
            // only keeps that handled rejection off the global handler.
            void currentTask
                .run((signal) => effect(value, signal))
                .catch(() => {});
        },
        {
            ...options,
            onError:
                options?.onError ??
                ((error: unknown) => {
                    logger.error("CancellableReaction:", error);
                }),
        },
    );

    return {
        reaction: reactionDisposer,
        getCurrentTask: () => currentTask,
    };
}
