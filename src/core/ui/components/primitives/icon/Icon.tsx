import React from "react";
import { logger } from "@core/lib/logger";
import { cn } from "@core/ui/utils/cn";
import iconRegistry, { isIconName } from "../../../icons/registry";
import type { IconName } from "../../../icons/registry";
import styles from "./Icon.module.css";

export type { IconName };
export { isIconName };

export interface IconProps {
    /** Name of the icon to display */
    name: IconName;
    /** CSS class name for additional styling */
    className?: string;
    /** Title / accessibility label for the icon */
    title?: string;
}

/**
 * Icon component for consistent SVG rendering throughout the application.
 * Icon size is determined entirely by the parent container's CSS.
 * Interactive icons use IconButton — a clickable img is not accessible.
 */
export const Icon: (props: IconProps) => React.ReactNode = ({
    name,
    className,
    title,
}) => {
    const src = iconRegistry[name];

    if (!src) {
        logger.warn(`Icon "${name}" not found in registry`);
        return null;
    }

    return (
        <img
            src={src}
            alt={title || ""}
            title={title}
            className={cn(styles.icon, className)}
            aria-hidden={!title || undefined}
        />
    );
};

export default Icon;
