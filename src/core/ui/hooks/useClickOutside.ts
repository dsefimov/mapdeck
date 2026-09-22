import { useEffect, useRef, type RefObject } from "react";

interface UseClickOutsideOptions {
    /** When `true`, defers listener attachment by one tick (`setTimeout 0`)
     *  to avoid capturing the same event that opened the element. */
    defer?: boolean;
}

/**
 * Calls `handler` when a `mousedown` event fires outside the given `ref`
 * element.
 *
 * @param ref     - React ref (or array of refs) of the watched element(s):
 *                  a mousedown inside ANY of them is not an outside click
 *                  (e.g. a dropdown watches its portal panel plus its
 *                  trigger, so re-clicking the trigger toggles, not
 *                  close-then-reopen)
 * @param handler - Callback invoked on outside click
 * @param enabled - When `false`, the listener is not attached (defaults to `true`)
 * @param options - Additional options
 */
export function useClickOutside(
    ref: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
    handler: () => void,
    enabled = true,
    { defer = false }: UseClickOutsideOptions = {},
): void {
    // Latest-capture refs: callers pass inline handlers and fresh ref
    // arrays every render — reading them through refs keeps the document
    // listener attached across re-renders instead of churning it.
    const watchedRef = useRef(Array.isArray(ref) ? ref : [ref]);
    watchedRef.current = Array.isArray(ref) ? ref : [ref];
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        if (!enabled) return;

        const handleClickOutside = (event: MouseEvent) => {
            const inside = watchedRef.current.some((r) =>
                r.current?.contains(event.target as Node),
            );
            if (!inside) {
                handlerRef.current();
            }
        };

        if (defer) {
            const timer = setTimeout(() => {
                document.addEventListener("mousedown", handleClickOutside);
            }, 0);
            return () => {
                clearTimeout(timer);
                document.removeEventListener("mousedown", handleClickOutside);
            };
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [enabled, defer]);
}
