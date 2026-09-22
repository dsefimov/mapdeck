import { useEffect } from "react";

/**
 * Invokes `handler` when the user presses Escape (window-level keydown).
 *
 * @param handler - Callback invoked on Escape
 * @param enabled - When `false`, the listener is not attached (defaults to `true`)
 */
export function useEscapeKey(handler: () => void, enabled = true): void {
    useEffect(() => {
        if (!enabled) return;
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") handler();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [handler, enabled]);
}
