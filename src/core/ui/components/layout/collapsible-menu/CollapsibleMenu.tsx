import React, { useRef, useCallback, useEffect, useState } from "react";
import { useClickOutside, useMenuKeyboard } from "@core/ui/hooks";
import { cn } from "@core/ui/utils/cn";
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

export const CollapsibleMenu: (props: CollapsibleMenuProps) => React.ReactNode = (props) => {
    const open = props.open ?? false;
    const closeOnClickOutside = props.closeOnClickOutside ?? true;
    const hideIfEmpty = props.hideIfEmpty ?? false;

    const [panelHeight, setPanelHeight] = useState(0);

    const menuRef = useRef<HTMLDivElement | null>(null);
    const panelNodeRef = useRef<HTMLDivElement | null>(null);
    const contentNodeRef = useRef<HTMLDivElement | null>(null);

    const hidden = hideIfEmpty && !props.children;

    // Stable callback ref: required to avoid remount on every render.
    const panelRef = useCallback(
        (node: HTMLDivElement | null) => {
            panelNodeRef.current = node;
            if (node && open) {
                setPanelHeight(node.scrollHeight);
                // The menu must own focus while open: a div panel is not
                // focusable by default, and keys pressed with focus on
                // <body> never reach the container's keydown handler.
                node.tabIndex = -1;
                node.focus({ preventScroll: true });
            } else if (!open) {
                setPanelHeight(0);
            }
        },
        [open],
    );

    // The height is captured once when the panel attaches; content may keep
    // growing while the menu stays open (async reports, locale switch) —
    // observing the content node keeps the clamp following it.
    useEffect(() => {
        if (!open) return;
        const contentEl = contentNodeRef.current;
        if (!contentEl || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => {
            const panel = panelNodeRef.current;
            if (panel) setPanelHeight(panel.scrollHeight);
        });
        observer.observe(contentEl);
        return () => observer.disconnect();
    }, [open]);

    useClickOutside(
        menuRef,
        () => props.onClose?.(),
        !hidden && closeOnClickOutside && open,
    );

    const handleKeyDown = useMenuKeyboard(menuRef, open, () =>
        props.onClose?.(),
    );

    if (hidden) {
        return null;
    }

    const containerClasses = props.className;
    const panelClasses = cn(
        styles.menuPanel,
        props.panelClassName,
        open && styles.menuPanelOpen,
    );
    const panelStyle = getPanelStyle(panelHeight, open);

    return (
        <div
            ref={menuRef}
            className={containerClasses}
            data-testid="collapsible-menu"
            onKeyDown={handleKeyDown}
        >
            <div
                ref={panelRef}
                className={panelClasses}
                style={panelStyle}
                role="menu"
                aria-hidden={!open}
            >
                <div
                    className={styles.menuContent}
                    ref={contentNodeRef}
                >
                    {props.children}
                </div>
            </div>
        </div>
    );
};

function getPanelStyle(
    panelHeight: number,
    open: boolean,
): React.CSSProperties {
    return {
        maxHeight: `${panelHeight}px`,
        opacity: open ? 1 : 0,
    };
}

