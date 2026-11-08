import React, { useEffect, useRef } from "react";
import { useClickOutside } from "../../../hooks/useClickOutside";
import { useMenuKeyboard } from "../../../hooks/useMenuKeyboard";
import { useRestoreFocus } from "../../../hooks/useRestoreFocus";
import { cn } from "../../../utils/cn";
import styles from "./CollapsibleMenu.module.css";

export interface CollapsibleMenuProps {
    children?: React.ReactNode;
    open?: boolean;
    onClose?: () => void;
    className?: string | undefined;
    panelClassName?: string | undefined;
    closeOnClickOutside?: boolean;
    hideIfEmpty?: boolean;
}

export const CollapsibleMenu: (props: CollapsibleMenuProps) => React.ReactNode = ({
    children,
    open = false,
    onClose,
    className,
    panelClassName,
    closeOnClickOutside = true,
    hideIfEmpty = false,
}) => {
    const menuRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    const hidden = hideIfEmpty && !children;

    useClickOutside(
        menuRef,
        () => onClose?.(),
        !hidden && closeOnClickOutside && open,
    );

    const handleKeyDown = useMenuKeyboard(panelRef, open, () =>
        onClose?.(),
    );

    // The menu owns focus while open: a div panel is not focusable by
    // default, and keys pressed with focus on <body> never reach the
    // container's keydown handler. Closing returns focus to the trigger.
    useRestoreFocus(open);
    useEffect(() => {
        if (open) panelRef.current?.focus({ preventScroll: true });
    }, [open]);

    if (hidden) {
        return null;
    }

    const panelClasses = cn(
        styles.menuPanel,
        panelClassName,
        open && styles.menuPanelOpen,
    );

    return (
        <div
            ref={menuRef}
            className={className}
            data-testid="collapsible-menu"
            onKeyDown={handleKeyDown}
        >
            <div ref={panelRef} className={panelClasses} role="group" tabIndex={-1}>
                <div className={styles.menuContent}>{children}</div>
            </div>
        </div>
    );
};
