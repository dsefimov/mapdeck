import { useEffect, type DependencyList } from "react";
import { createCancellable } from "@core/shared/async";

/**
 * Async-aware useEffect with automatic cancellation on unmount.
 * Uses AbortController to signal cancellation when the component unmounts
 * or when dependencies change.
 */
export function useAsyncEffect(
    effect: (signal: AbortSignal) => Promise<void>,
    deps: DependencyList,
): void {
    useEffect(() => {
        const task = createCancellable();
        task.run(effect);
        return () => {
            task.cancel();
        };
    }, deps);
}
