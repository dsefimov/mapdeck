import { useEffect, useRef, type RefObject } from "react";
import maplibregl from "maplibre-gl";
import type { MapContextMenuAPI } from "@core/ui/components";
import type { MapClickPoint } from "@core/framework/store";
import { isStaticClick } from "./isStaticClick";

const DRAG_THRESHOLD = 5;

/** Attach right-click → context menu handlers to the map. */
export function useMapContextMenuTrigger(
    mapRef: RefObject<maplibregl.Map | null>,
    ctx: MapContextMenuAPI,
    lastRightClickRef: RefObject<MapClickPoint | null>,
): void {
    const rightClickStartRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const canvas = map.getCanvas();

        const handleNativeContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        const handleMouseDown = (
            event: maplibregl.MapMouseEvent & { originalEvent: MouseEvent },
        ) => {
            if (event.originalEvent.button === 2) {
                rightClickStartRef.current = {
                    x: event.point.x,
                    y: event.point.y,
                };
            }
        };

        const handleContextMenu = (
            event: maplibregl.MapMouseEvent & { originalEvent: MouseEvent },
        ) => {
            event.preventDefault();
            const start = rightClickStartRef.current;
            rightClickStartRef.current = null;
            if (!start) return;

            if (
                isStaticClick(
                    start,
                    { x: event.point.x, y: event.point.y },
                    DRAG_THRESHOLD,
                )
            ) {
                ctx.open({
                    x: event.originalEvent.clientX,
                    y: event.originalEvent.clientY,
                });
                lastRightClickRef.current = {
                    lngLat: { lng: event.lngLat.lng, lat: event.lngLat.lat },
                    screenPoint: { x: event.point.x, y: event.point.y },
                };
            }
        };

        canvas.addEventListener("contextmenu", handleNativeContextMenu);
        map.on("mousedown", handleMouseDown);
        map.on("contextmenu", handleContextMenu);

        return () => {
            canvas.removeEventListener("contextmenu", handleNativeContextMenu);
            map.off("mousedown", handleMouseDown);
            map.off("contextmenu", handleContextMenu);
        };
    }, [ctx, mapRef]);
}
