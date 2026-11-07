import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type RefObject,
} from "react";

/** Panel offset from the trigger, px */
const PANEL_OFFSET = 4;

/** Mirrors the panel's CSS max-height (13rem) — the flip estimate before the panel is measured. */
const PANEL_MAX_HEIGHT_PX = 208;

export interface PanelPosition {
    top: number;
    left: number;
    width: number;
}

/**
 * Anchors the dropdown panel to its trigger: below it, or flipped above
 * when the viewport has no room below. The first placement estimates the
 * panel height by the CSS cap; the next frame re-places with the measured
 * geometry. Also owns the outside scroll/resize close — a fixed-positioned
 * panel goes stale otherwise — while the panel's own list scrolling must
 * not close it.
 */
export function useSelectPanel(
    open: boolean,
    onClose: () => void,
): {
    triggerRef: RefObject<HTMLButtonElement | null>;
    panelRef: RefObject<HTMLDivElement | null>;
    position: PanelPosition | null;
} {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<PanelPosition | null>(null);

    const place = useCallback(() => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const height =
            panelRef.current?.getBoundingClientRect().height ??
            PANEL_MAX_HEIGHT_PX;
        const roomBelow = window.innerHeight - rect.bottom - PANEL_OFFSET;
        const flip = height > roomBelow && rect.top > window.innerHeight / 2;
        const next: PanelPosition = {
            top: flip
                ? Math.max(0, rect.top - height - PANEL_OFFSET)
                : rect.bottom + PANEL_OFFSET,
            left: rect.left,
            width: rect.width,
        };
        setPosition((prev) =>
            prev &&
            prev.top === next.top &&
            prev.left === next.left &&
            prev.width === next.width
                ? prev
                : next,
        );
    }, []);

    useEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }
        place();
        const timer = window.setTimeout(place, 0);
        return () => window.clearTimeout(timer);
    }, [open, place]);

    useEffect(() => {
        if (!open) return;
        const close = (event: Event): void => {
            if (
                event.target instanceof Node &&
                panelRef.current?.contains(event.target)
            ) {
                return;
            }
            onClose();
        };
        window.addEventListener("scroll", close, true);
        window.addEventListener("resize", close);
        return () => {
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("resize", close);
        };
    }, [open, onClose]);

    return { triggerRef, panelRef, position };
}
