import { useEffect } from "react";

/**
 * Minimal structural view of a map-like object exposing its drawing canvas.
 * Keeps the hook free of maplibre imports (the ui layer depends on lib only).
 */
interface CanvasSource {
    getCanvas(): HTMLCanvasElement | undefined;
}

/**
 * Sets `cursor` on the map canvas for as long as the component is mounted
 * (re-applied when `cursor` changes) and clears it on cleanup.
 *
 * @param map    - Map instance providing the drawing canvas
 * @param cursor - CSS cursor keyword (e.g. `"crosshair"`); empty string resets
 */
export function useMapCursor(map: CanvasSource, cursor: string): void {
    useEffect(() => {
        const canvas = map.getCanvas();
        if (!canvas) return;
        canvas.style.cursor = cursor;
        return () => {
            canvas.style.cursor = "";
        };
    }, [map, cursor]);
}
