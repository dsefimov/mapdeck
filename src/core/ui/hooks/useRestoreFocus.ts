import { useEffect, useRef } from "react";

/**
 * Returns focus to the element that was active when the overlay opened,
 * once it closes. Menus that move focus into their panel leave keyboard
 * users stranded when the panel unmounts and focus dies with it.
 */
export function useRestoreFocus(open: boolean): void {
    const restoreRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (open) {
            restoreRef.current =
                document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
            return;
        }
        const target = restoreRef.current;
        restoreRef.current = null;
        if (target && target.isConnected) {
            target.focus({ preventScroll: true });
        }
    }, [open]);
}
