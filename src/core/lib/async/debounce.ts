/** A debounced function with a handle to drop the pending invocation. */
export interface Debounced<A extends unknown[]> {
    (...args: A): void;
    cancel(): void;
}

/**
 * Creates a debounced version of the provided function.
 * The debounced function delays invoking `fn` until `delayMs` ms have
 * elapsed since the last invocation.
 */
export function debounce<A extends unknown[]>(
    fn: (...args: A) => void,
    delayMs: number,
): Debounced<A> {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const debounced = (...args: A): void => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn(...args);
        }, delayMs);
    };

    debounced.cancel = (): void => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };

    return debounced;
}
