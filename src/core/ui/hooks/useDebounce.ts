import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { debounce } from "@core/lib/async";
import { useLatest } from "./useLatest";

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
 * @param delay - Delay in milliseconds; the debounced instance is recreated
 *                when it changes, dropping the pending call of the old one
 */
export function useDebounce<T extends unknown[]>(
    callback: Callback<T>,
    delay: number,
): UseDebounceResult<T> {
    const callbackRef = useLatest(callback);

    const argsRef = useRef<T | null>(null);
    const [isPending, setIsPending] = useState(false);

    // Single debounced instance per delay. The inner wrapper reads
    // callbackRef.current at invocation time, so it always calls the
    // latest version without recreating the debounce.
    const debounced = useMemo(
        () =>
            debounce<T>((...args: T) => {
                argsRef.current = null;
                setIsPending(false);
                callbackRef.current(...args);
            }, delay),
        [delay],
    );

    useEffect(() => {
        return () => debounced.cancel();
    }, [debounced]);

    const call = useCallback(
        (...args: T) => {
            argsRef.current = args;
            setIsPending(true);
            debounced(...args);
        },
        [debounced],
    );

    const flush = useCallback(() => {
        debounced.cancel();
        if (argsRef.current !== null) {
            const args = argsRef.current;
            argsRef.current = null;
            setIsPending(false);
            callbackRef.current(...args);
        }
    }, [debounced]);

    const cancel = useCallback(() => {
        debounced.cancel();
        argsRef.current = null;
        setIsPending(false);
    }, [debounced]);

    return { call, isPending, flush, cancel };
}
