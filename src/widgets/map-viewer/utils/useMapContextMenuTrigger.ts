/* global performance */
import { useEffect, useRef, type RefObject } from "react";
import maplibregl from "maplibre-gl";
import type { MapContextMenuAPI } from "@core/ui/components";
import type { MapClickPoint } from "@core/domain/map";
import { isStaticClick } from "./isStaticClick";

const DRAG_THRESHOLD = 5;

/**
 * Input layers emit an echo press/release cycle milliseconds after a
 * right-button interaction settles; presses inside this window never arm
 * the trigger.
 */
const ECHO_PRESS_WINDOW_MS = 200;

/**
 * Attach right-click → context menu handlers to the map.
 *
 * Gesture detection listens for `movestart` while the right button is held
 * (maplibre v5 forwards contextmenu unconditionally on platforms where the
 * browser emits it after mouseup). Inertia from an earlier gesture keeps
 * emitting `move` but never a fresh `movestart`, so legitimate clicks stay
 * unaffected.
 */
export function useMapContextMenuTrigger(
    mapRef: RefObject<maplibregl.Map | null>,
    ctx: MapContextMenuAPI,
    lastRightClickRef: RefObject<MapClickPoint | null>,
): void {
    const rightClickStartRef = useRef<{ x: number; y: number } | null>(null);
    const pressActiveRef = useRef(false);
    const pressMovedRef = useRef(false);
    const lastPressSettledAtRef = useRef(0);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        // Suppression spans the whole container: maplibre controls and the
        // portal-rendered menu live outside the canvas element.
        const container = map.getContainer();

        const handleNativeContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        const handlePressStart = (
            e: maplibregl.MapMouseEvent & { originalEvent: MouseEvent },
        ) => {
            if (e.originalEvent.button !== 2) return;
            if (
                performance.now() - lastPressSettledAtRef.current <
                ECHO_PRESS_WINDOW_MS
            ) {
                return;
            }
            rightClickStartRef.current = { x: e.point.x, y: e.point.y };
            pressActiveRef.current = true;
            pressMovedRef.current = false;
        };

        const handleMoveStart = () => {
            if (pressActiveRef.current) pressMovedRef.current = true;
        };

        const handlePressEnd = (
            e: maplibregl.MapMouseEvent & { originalEvent: MouseEvent },
        ) => {
            if (e.originalEvent.button !== 2) return;
            lastPressSettledAtRef.current = performance.now();
            const start = rightClickStartRef.current;
            const moved = pressMovedRef.current;
            rightClickStartRef.current = null;
            pressActiveRef.current = false;
            if (!start || moved) return;

            if (
                !isStaticClick(
                    start,
                    { x: e.point.x, y: e.point.y },
                    DRAG_THRESHOLD,
                )
            ) {
                return;
            }

            ctx.open({
                x: e.originalEvent.clientX,
                y: e.originalEvent.clientY,
            });
            lastRightClickRef.current = {
                lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat },
                screenPoint: { x: e.point.x, y: e.point.y },
            };
        };

        container.addEventListener("contextmenu", handleNativeContextMenu);
        map.on("mousedown", handlePressStart);
        map.on("mouseup", handlePressEnd);
        map.on("movestart", handleMoveStart);

        return () => {
            container.removeEventListener(
                "contextmenu",
                handleNativeContextMenu,
            );
            map.off("mousedown", handlePressStart);
            map.off("mouseup", handlePressEnd);
            map.off("movestart", handleMoveStart);
        };
    }, [ctx, mapRef]);
}
