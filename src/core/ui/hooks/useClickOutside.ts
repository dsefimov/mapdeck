import { useEffect, type RefObject } from "react";
import { useLatest } from "./useLatest";

/**
 * Calls `handler` when a `pointerdown` event fires outside the given `ref`
 * element.
 *
 * @param ref     - React ref (or array of refs) of the watched element(s):
 *                  a press inside ANY of them is not an outside click
 *                  (e.g. a dropdown watches its portal panel plus its
 *                  trigger, so re-clicking the trigger toggles, not
 *                  close-then-reopen)
 * @param handler - Callback invoked on outside press
 * @param enabled - When `false`, the listener is not attached (defaults to `true`)
 */
export function useClickOutside(
    ref: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
    handler: () => void,
    enabled = true,
): void {
    // Latest-capture refs: callers pass inline handlers and fresh ref
    // arrays every render — reading them through refs keeps the document
    // listener attached across re-renders instead of churning it.
    const watched = useLatest(Array.isArray(ref) ? ref : [ref]);
    const handlerLatest = useLatest(handler);

    useEffect(() => {
        if (!enabled) return;

        const handlePointerDown = (event: PointerEvent) => {
            const inside = watched.current.some((r) =>
                r.current?.contains(event.target as Node),
            );
            if (!inside) {
                handlerLatest.current();
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [enabled, watched, handlerLatest]);
}
