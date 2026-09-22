import { logger } from "@core/lib/logger";

export interface CancellableTask {
    signal: AbortSignal;
    cancel: () => void;
    run: (fn: (signal: AbortSignal) => Promise<void>) => Promise<void>;
}

/**
 * Creates a cancellable task with an AbortController.
 * Use `run()` to execute async work that can be cancelled via `cancel()`.
 */
export function createCancellable(): CancellableTask {
    const controller = new AbortController();

    return {
        get signal() {
            return controller.signal;
        },
        cancel: () => {
            logger.debug("CancellableTask: cancelled");
            controller.abort();
        },
        run: async (fn: (signal: AbortSignal) => Promise<void>) => {
            try {
                await fn(controller.signal);
            } catch (error) {
                if (!controller.signal.aborted) {
                    logger.error("CancellableTask: unhandled error:", error);
                    throw error;
                }
                logger.debug("CancellableTask: task cancelled (aborted)");
            }
        },
    };
}
