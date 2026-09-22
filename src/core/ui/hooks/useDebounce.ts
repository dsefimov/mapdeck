import { useRef, useState, useEffect, useCallback } from "react";
import { debounce } from "@core/lib/async/debounce";

type Callback<T extends unknown[]> = (...args: T) => void;

export interface UseDebounceResult<T extends unknown[]> {
    /** The debounced version of the callback */
    call: (...args: T) => void;
    /** Whether a debounced call is currently pending */
    isPending: boolean;
    /** Immediately invoke the callback with the latest args and cancel any pending timeout */
    flush: () => void;
    /** Cancel any pending timeout without invoking the callback */
    cancel: () => void;
}

/**
 * React hook wrapping the standalone `debounce` utility from the infra shared async helpers.
 * Adds React-specific features: callback ref tracking, `isPending` state,
 * `flush()`, and automatic cleanup on unmount.
 *
 * @param callback - The function to debounce (may change between renders)
 * @param delay - Delay in milliseconds; fixed when the hook mounts — a
 *                `delay` change between renders is ignored until remount
 */
export function useDebounce<T extends unknown[]>(
    callback: Callback<T>,
    delay: number,
): UseDebounceResult<T> {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    const argsRef = useRef<T | null>(null);
    const [isPending, setIsPending] = useState(false);

    // Single debounced instance — delegates to the infra shared debounce.
    // The inner wrapper reads callbackRef.current at invocation time,
    // so it always calls the latest version without recreating the debounce.
    const debouncedRef = useRef(
        debounce<T>((...args: T) => {
            setIsPending(false);
            callbackRef.current(...args);
        }, delay),
    );

    useEffect(() => {
        return () => debouncedRef.current.cancel?.();
    }, []);

    const call = useCallback(
        (...args: T) => {
            argsRef.current = args;
            setIsPending(true);
            debouncedRef.current(...args);
        },
        [setIsPending],
    );

    const flush = useCallback(() => {
        debouncedRef.current.cancel?.();
        if (argsRef.current !== null) {
            setIsPending(false);
            callbackRef.current(...argsRef.current);
            argsRef.current = null;
        }
    }, [setIsPending]);

    const cancel = useCallback(() => {
        debouncedRef.current.cancel?.();
        argsRef.current = null;
        setIsPending(false);
    }, [setIsPending]);

    return { call, isPending, flush, cancel };
}
