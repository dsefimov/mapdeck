import React, { useRef, useCallback, useState } from "react";
import { useClickOutside } from "@core/framework/hooks";
import { cn } from "@core/ui/utils/cn";
import styles from "./CollapsibleMenu.module.css";

export interface CollapsibleMenuItem {
    id: string;
    component: (nodeId: string) => React.ReactNode;
}

export interface CollapsibleMenuProps {
    items?: CollapsibleMenuItem[];
    children?: React.ReactNode;
    open?: boolean;
    onClose?: () => void;
    className?: string | undefined;
    panelClassName?: string | undefined;
    closeOnClickOutside?: boolean;
    hideIfEmpty?: boolean;
    nodeId?: string;
}

export const CollapsibleMenu: React.FC<CollapsibleMenuProps> = (props) => {
    const items = props.items ?? [];
    const open = props.open ?? false;
    const closeOnClickOutside = props.closeOnClickOutside ?? true;
    const hideIfEmpty = props.hideIfEmpty ?? false;

    const [panelHeight, setPanelHeight] = useState(0);

    const menuRef = useRef<HTMLDivElement | null>(null);

    const hidden = shouldHide(hideIfEmpty, items.length, props.children);

    // Stable callback ref: required to avoid remount on every render.
    const panelRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (node && open) {
                setPanelHeight(node.scrollHeight);
            } else if (!open) {
                setPanelHeight(0);
            }
        },
        [open],
    );

    useClickOutside(
        menuRef,
        () => props.onClose?.(),
        !hidden && closeOnClickOutside && open,
    );

    if (hidden) {
        return null;
    }

    const containerClasses = cn(styles.collapsibleMenu, props.className);
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
        >
            <div
                ref={panelRef}
                className={panelClasses}
                style={panelStyle}
                role="menu"
                aria-hidden={!open}
            >
                <div className={styles.menuContent}>
                    <MenuItems items={items} nodeId={props.nodeId}>
                        {props.children}
                    </MenuItems>
                </div>
            </div>
        </div>
    );
};

interface MenuItemsProps {
    items: CollapsibleMenuItem[];
    nodeId: string | undefined;
    children?: React.ReactNode;
}

const MenuItems = ({ items, nodeId, children }: MenuItemsProps) => (
    <>
        {items.map((item) => (
            <div key={item.id} className={styles.menuComponent}>
                {item.component(nodeId ?? "")}
            </div>
        ))}
        {children}
    </>
);

function shouldHide(
    hideIfEmpty: boolean,
    itemsLength: number,
    children?: React.ReactNode,
): boolean {
    return hideIfEmpty && itemsLength === 0 && !children;
}

function getPanelStyle(
    panelHeight: number,
    open: boolean,
): React.CSSProperties {
    return {
        maxHeight: `${panelHeight}px`,
        opacity: open ? 1 : 0,
    };
}

export default CollapsibleMenu;
