import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Text } from "../../primitives/text/Text";
import { useMenuKeyboard } from "../../../hooks/useMenuKeyboard";
import { useRestoreFocus } from "../../../hooks/useRestoreFocus";
import { clampMenuPosition } from "./clampMenuPosition";
import type { ContextMenuPosition, MenuSize } from "./useContextMenu";
import styles from "./ContextMenu.module.css";

export interface ContextMenuItem {
    id: string;
    label: string;
}

export interface ContextMenuProps {
    /** Null position means the menu is closed. */
    position: ContextMenuPosition | null;
    items: ContextMenuItem[];
    activeItemId?: string | null;
    /** Caption over the item list — the host owns the vocabulary. */
    header: string;
    onSelect: (id: string) => void;
    onClose: () => void;
    /**
     * Right-press on the backdrop while the menu is open — the standard
     * "relocate here" gesture. Receives the raw event so the host can map
     * client coordinates onto its own surface.
     */
    onReposition?: (e: ReactMouseEvent) => void;
}

/** Gap between cursor and menu when the CSS padding cannot be parsed. */
const MENU_MARGIN_FALLBACK_PX = 8;

export const ContextMenu: (props: ContextMenuProps) => ReactNode = ({
    position,
    items,
    activeItemId,
    header,
    onSelect,
    onClose,
    onReposition,
}) => {
    const isOpen = position !== null;
    const [menuSize, setMenuSize] = useState<MenuSize | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    useRestoreFocus(isOpen);

    const measureMenu = useCallback((node: HTMLDivElement | null) => {
        if (!node) {
            setMenuSize(null);
            return;
        }
        const rect = node.getBoundingClientRect();
        const cs = window.getComputedStyle(node);
        // Fallback mirrors the CSS padding that keeps the menu off the cursor.
        const margin = parseFloat(cs.paddingLeft) || MENU_MARGIN_FALLBACK_PX;
        setMenuSize({
            width: rect.width,
            height: rect.height,
            margin,
        });
    }, []);

    // Ref-callback composition: keep the node for key navigation while
    // measuring it for viewport clamping.
    const attachMenu = useCallback(
        (node: HTMLDivElement | null) => {
            menuRef.current = node;
            measureMenu(node);
        },
        [measureMenu],
    );

    const handleMenuKey = useMenuKeyboard(menuRef, isOpen, onClose);

    useEffect(() => {
        if (!isOpen) return;

        const onKey = (e: KeyboardEvent): void => handleMenuKey(e);

        document.addEventListener("keydown", onKey);
        window.addEventListener("resize", onClose);

        return () => {
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onClose);
        };
    }, [isOpen, onClose, handleMenuKey]);

    // Menu keys must land on a menu item, not on whatever surface the
    // right-click happened over: focus the first item once the panel is
    // measured (focusing a visibility:hidden element is a no-op).
    useEffect(() => {
        if (!isOpen || !menuSize) return;
        const panel = menuRef.current;
        if (!panel) return;
        const firstItem = panel.querySelector<HTMLElement>(
            '[role="menuitem"]',
        );
        (firstItem ?? panel).focus({ preventScroll: true });
    }, [isOpen, menuSize]);

    if (!isOpen || !position) return null;

    const adjustedPosition = menuSize
        ? clampMenuPosition(position, menuSize, {
              width: window.innerWidth,
              height: window.innerHeight,
          })
        : position;

    return createPortal(
        <>
            <div
                className={styles.overlay}
                onMouseDown={(e) => {
                    // Primary dismisses; the input layer echoes settled
                    // right-clicks as synthetic presses, so a non-primary
                    // press must not close a freshly opened menu.
                    if (e.button === 0) {
                        onClose();
                    } else if (e.button === 2) {
                        onReposition?.(e);
                    }
                }}
                onContextMenu={(e) => e.preventDefault()}
            />
            <div
                ref={attachMenu}
                className={styles.menu}
                style={{
                    left: adjustedPosition.x,
                    top: adjustedPosition.y,
                    // Never paints: the ref measures during commit.
                    visibility: menuSize ? undefined : "hidden",
                }}
                role="menu"
                // Focus fallback for an empty tool list — the panel itself
                // receives focus so the menu keys still have a target.
                tabIndex={-1}
                onContextMenu={(e) => e.preventDefault()}
            >
                <Text variant="caption" className={styles.header}>
                    {header}
                </Text>
                {items.map((item) => {
                    const isActive = activeItemId === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={styles.item}
                            onClick={() => onSelect(item.id)}
                            role="menuitem"
                            aria-current={isActive ? "true" : undefined}
                        >
                            <Text
                                variant="body"
                                truncate
                                className={styles.itemLabel}
                                tone={isActive ? "accent" : undefined}
                                weight={isActive ? "semibold" : undefined}
                            >
                                {item.label}
                            </Text>
                        </button>
                    );
                })}
            </div>
        </>,
        document.body,
    );
};

