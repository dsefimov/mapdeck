import React from "react";
import { Icon } from "@core/ui/components/primitives/icon/Icon";
import type { IconName } from "@core/ui/icons/registry";
import { cn } from "@core/ui/utils/cn";
import styles from "./IconButton.module.css";

export interface IconButtonProps {
    /**
     * Icon from the registry (src/core/ui/icons/registry.ts). Extension data
     * types icons as plain string — validate with `isIconName` and pass
     * `null` to render an empty placeholder.
     */
    icon: IconName | null;
    /** Accessible name (title + aria-label) */
    label: string;
    /** Visual treatment: ghost — borderless, tile — bordered box */
    variant?: "ghost" | "tile";
    onClick?: () => void;
    /** Active state — highlighted with the accent */
    active?: boolean;
    size?: "sm" | "md";
    disabled?: boolean;
    className?: string | undefined;
}

/**
 * Design-system icon button. Used in layer-tree, widget headers,
 * map-tool toolbars (tile).
 */
export const IconButton: (props: IconButtonProps) => React.ReactNode = ({
    icon,
    label,
    variant = "ghost",
    onClick,
    active,
    size = "sm",
    disabled,
    className,
}) => {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                styles.button,
                styles[variant],
                styles[size],
                active && styles[`${variant}Active`],
                className,
            )}
        >
            {icon ? (
                <Icon
                    name={icon}
                    title={label}
                    {...(styles.icon && { className: styles.icon })}
                />
            ) : (
                <span className={styles.placeholder} />
            )}
        </button>
    );
};

export default IconButton;
