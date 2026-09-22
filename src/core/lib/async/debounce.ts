/**
 * Creates a debounced version of the provided function.
 * The debounced function delays invoking `fn` until `delay` ms have elapsed
 * since the last invocation. The returned callable always carries `cancel()`
 * to clear any pending invocation.
 */
export function debounce<T extends unknown[]>(
    fn: (this: unknown, ...args: T) => void,
    delay: number,
): {
    (this: unknown, ...args: T): void;
    cancel: () => void;
} {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const debounced = function (this: unknown, ...args: T): void {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn.apply(this, args);
        }, delay);
    };

    debounced.cancel = (): void => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    return debounced;
}
