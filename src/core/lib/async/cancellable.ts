import { logger } from "../logger";

export interface CancellableTask {
    signal: AbortSignal;
    cancel: () => void;
    run: <T>(
        fn: (signal: AbortSignal) => Promise<T>,
    ) => Promise<T | undefined>;
}

/**
 * Creates a cancellable task around one AbortController. `run` forwards
 * the controller's signal to the task; `cancel` aborts it. A rejection
 * observed after `cancel` is swallowed — ANY error, including a genuine
 * bug that happens to land post-cancel; errors before cancellation
 * rethrow to the caller.
 */
export function createCancellableTask(): CancellableTask {
    const controller = new AbortController();

    return {
        get signal() {
            return controller.signal;
        },
        cancel: () => {
            controller.abort();
        },
        run: async <T>(fn: (signal: AbortSignal) => Promise<T>) => {
            try {
                return await fn(controller.signal);
            } catch (error) {
                if (!controller.signal.aborted) throw error;
                logger.debug(
                    "CancellableTask: swallowed a post-cancel error",
                    error,
                );
            }
        },
    };
}
