import React, { useCallback } from "react";

const FOCUSABLE_SELECTOR = [
    "button",
    "[href]",
    "input",
    "select",
    "textarea",
    '[tabindex]:not([tabindex="-1"])',
].join(", ");

const NAVIGATION_KEYS = new Set([
    "ArrowDown",
    "ArrowUp",
    "Home",
    "End",
]);

/**
 * Structural shape of a key event — matches both the React synthetic event
 * and the native `KeyboardEvent`, so the same handler serves component-level
 * `onKeyDown` and document-level listeners.
 */
export interface MenuKeyboardEvent {
    key: string;
    preventDefault(): void;
}

/** Focusable, enabled elements of the menu panel, in DOM order. */
function focusablesOf(panel: HTMLElement | null): HTMLElement[] {
    if (!panel) return [];
    return [
        ...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ].filter((el) => !el.hasAttribute("disabled"));
}

/**
 * Roving keyboard focus over whatever focusable elements the menu panel
 * happens to render — menus host arbitrary tool components, so the
 * WAI-ARIA menu keys walk live DOM instead of a static item list.
 */
export function useMenuKeyboard(
    panelRef: React.RefObject<HTMLElement | null>,
    open: boolean,
    onClose: () => void,
): (event: MenuKeyboardEvent) => void {
    return useCallback(
        (event: MenuKeyboardEvent) => {
            if (!open) return;
            if (event.key === "Escape") {
                onClose();
                return;
            }
            if (!NAVIGATION_KEYS.has(event.key)) return;

            const focusables = focusablesOf(panelRef.current);
            if (focusables.length === 0) return;

            event.preventDefault();
            const active = document.activeElement as HTMLElement | null;
            const idx = active ? focusables.indexOf(active) : -1;
            focusables[
                nextFocusIndex(event.key, idx, focusables.length)
            ]?.focus();
        },
        [panelRef, open, onClose],
    );
}

/** Where roving focus moves for the pressed key, wrapping at both ends. */
function nextFocusIndex(key: string, current: number, count: number): number {
    if (key === "Home") return 0;
    if (key === "End") return count - 1;
    if (key === "ArrowDown") return (current + 1) % count;
    return (current <= 0 ? count : current) - 1;
}
