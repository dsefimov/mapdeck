import { useEffect } from "react";
import { useLatest } from "./useLatest";

/**
 * Invokes `handler` when the user presses Escape (window-level keydown).
 *
 * @param handler - Callback invoked on Escape
 * @param enabled - When `false`, the listener is not attached (defaults to `true`)
 */
export function useEscapeKey(handler: () => void, enabled = true): void {
    const handlerLatest = useLatest(handler);

    useEffect(() => {
        if (!enabled) return;
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") handlerLatest.current();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [enabled, handlerLatest]);
}
