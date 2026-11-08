import { useEffect } from "react";

/**
 * Returns focus to the element that was active when the overlay opened —
 * on close and on unmount-while-open (the panel's death takes focus with
 * it). The restore lives in the effect cleanup: it survives React's
 * dev-mode double-run of effects, which would otherwise capture the panel
 * itself as the "previous" focus.
 */
export function useRestoreFocus(open: boolean): void {
    useEffect(() => {
        if (!open) return;
        const previous =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        return () => {
            if (previous && previous.isConnected) {
                previous.focus({ preventScroll: true });
            }
        };
    }, [open]);
}
