import { useEffect } from "react";
import { useLatest } from "./useLatest";

/**
 * Escape layers of stacked overlays — a lightbox over a tool panel. Without
 * it, every enabled listener would fire on one press and close the whole
 * stack at once; only the topmost layer reacts, and the layer below takes
 * over once it unmounts.
 */
const escapeLayers: symbol[] = [];

/**
 * Invokes `handler` when the user presses Escape (window-level keydown).
 * Layers stack by mount order: a press reaches only the topmost enabled
 * instance — an overlay above it (mounted later) consumes the press first.
 *
 * @param handler - Callback invoked on Escape
 * @param enabled - When `false`, the listener is not attached (defaults to `true`)
 */
export function useEscapeKey(handler: () => void, enabled = true): void {
    const handlerLatest = useLatest(handler);

    useEffect(() => {
        if (!enabled) return;
        const layer = Symbol("escape-layer");
        escapeLayers.push(layer);
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key !== "Escape") return;
            if (escapeLayers[escapeLayers.length - 1] !== layer) return;
            handlerLatest.current();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            escapeLayers.splice(escapeLayers.indexOf(layer), 1);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [enabled, handlerLatest]);
}
