import React, { useCallback } from "react";

const FOCUSABLE_SELECTOR = [
    "button",
    "[href]",
    'input:not([type="hidden"])',
    "select",
    "textarea",
    '[tabindex]:not([tabindex="-1"])',
].join(", ");

type NavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

const NAVIGATION_KEYS: ReadonlySet<NavigationKey> = new Set([
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

/** Focusable, enabled, visible elements of the menu panel, in DOM order. */
export function focusablesOf(panel: HTMLElement | null): HTMLElement[] {
    if (!panel) return [];
    return [
        ...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ].filter(
        (el) =>
            !el.hasAttribute("disabled") &&
            !el.closest("[inert]") &&
            // display:none / visibility:hidden — focus() on them is a no-op.
            // Engines predating checkVisibility (Safari < 17.4) count as
            // visible: the worst case is a no-op focus, not a crash.
            (el.checkVisibility?.() ?? true),
    );
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
            if (!isNavigationKey(event.key)) return;

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

function isNavigationKey(key: string): key is NavigationKey {
    return NAVIGATION_KEYS.has(key as NavigationKey);
}

/** Where roving focus moves for the pressed key, wrapping at both ends. */
function nextFocusIndex(
    key: NavigationKey,
    current: number,
    count: number,
): number {
    switch (key) {
        case "Home":
            return 0;
        case "End":
            return count - 1;
        case "ArrowDown":
            return (current + 1) % count;
        case "ArrowUp":
            return (current <= 0 ? count : current) - 1;
    }
}
