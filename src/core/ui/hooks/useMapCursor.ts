import { useEffect } from "react";

/**
 * Minimal structural view of a map-like object exposing its drawing canvas.
 * Keeps the hook free of maplibre imports (the ui layer depends on lib only).
 */
interface CanvasSource {
    getCanvas(): HTMLCanvasElement | undefined;
}

/**
 * Deck's interleaved overlay rewrites the canvas cursor inline on every
 * render frame (its default getCursor yields grab/grabbing), silently
 * overwriting any plain inline value set here. The class pairs with a
 * stylesheet !important rule in vendor-overrides.css, which outranks the
 * per-frame inline writes; the cursor keyword rides in a CSS variable.
 */
const CURSOR_CLASS = "mapdeck-canvas-tool-cursor";
const CURSOR_VARIABLE = "--mapdeck-canvas-cursor";

/**
 * Shows `cursor` over the map canvas for as long as the component is
 * mounted (re-applied when `cursor` changes) and reverts to the map's
 * own cursor on cleanup.
 *
 * @param map    - Map instance providing the drawing canvas
 * @param cursor - CSS cursor keyword (e.g. `"pointer"`); empty string
 *                 disables the override, leaving the map default
 */
export function useMapCursor(map: CanvasSource, cursor: string): void {
    useEffect(() => {
        const canvas = map.getCanvas();
        if (!canvas || cursor === "") return;
        canvas.style.setProperty(CURSOR_VARIABLE, cursor);
        canvas.classList.add(CURSOR_CLASS);
        return () => {
            canvas.classList.remove(CURSOR_CLASS);
            canvas.style.removeProperty(CURSOR_VARIABLE);
        };
    }, [map, cursor]);
}
