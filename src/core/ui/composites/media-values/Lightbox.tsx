import { useEffect, useRef } from "react";
import type {
    KeyboardEvent as ReactKeyboardEvent,
    MouseEvent as ReactMouseEvent,
    ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../../components/primitives/icon-button/IconButton";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useRestoreFocus } from "../../hooks/useRestoreFocus";
import { focusablesOf } from "../../hooks/useMenuKeyboard";
import styles from "./Lightbox.module.css";

export interface LightboxProps {
    /** Accessible dialog name — the viewed item's title. */
    label: string;
    closeLabel: string;
    onClose: () => void;
    children: ReactNode;
}

/**
 * Fullscreen dialog shell for value viewers: portal, scrim, Escape, close
 * button, and a Tab cycle confined to the dialog. The first modal of the
 * design system (ADR-0021) — its semantics live here, not in each viewer.
 */
export const Lightbox: (props: LightboxProps) => ReactNode = ({
    label,
    closeLabel,
    onClose,
    children,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEscapeKey(onClose);
    useRestoreFocus(true);

    useEffect(() => {
        containerRef.current?.focus({ preventScroll: true });
    }, []);

    // Tab never leaves the dialog: the cycle wraps at both edges, and a
    // focus sitting outside the cycle (the container itself) enters at
    // the matching edge.
    const handleKeyDown = (
        event: ReactKeyboardEvent<HTMLDivElement>,
    ): void => {
        if (event.key !== "Tab") return;
        event.preventDefault();
        const focusables = focusablesOf(containerRef.current);
        if (focusables.length === 0) {
            containerRef.current?.focus();
            return;
        }
        const active = document.activeElement as HTMLElement | null;
        const rawIndex = active ? focusables.indexOf(active) : -1;
        const fallback = event.shiftKey ? focusables.length : -1;
        const index = rawIndex === -1 ? fallback : rawIndex;
        const delta = event.shiftKey ? -1 : 1;
        const next = (index + delta + focusables.length) % focusables.length;
        focusables[next]?.focus();
    };

    const handleMouseDown = (
        event: ReactMouseEvent<HTMLDivElement>,
    ): void => {
        if (event.target === event.currentTarget) onClose();
    };

    return createPortal(
        <div
            ref={containerRef}
            className={styles.lightbox}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            onMouseDown={handleMouseDown}
        >
            <IconButton
                icon="close"
                label={closeLabel}
                variant="tile"
                className={styles.close}
                onClick={onClose}
            />
            <div className={styles.content}>{children}</div>
        </div>,
        document.body,
    );
};
