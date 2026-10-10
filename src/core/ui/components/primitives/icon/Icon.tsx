import React from "react";
import { cn } from "@core/ui/utils/cn";
import { isIconName } from "../../../icons/registry";
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
 * Design-system icon: a masked span painted with currentColor. The glyph
 * comes from the `--icon-<name>` theme token, so hosts swap artwork and
 * recolor the set through the same token overrides as the rest of the
 * theme. Icon size is determined entirely by the parent container's CSS.
 * Interactive icons use IconButton — a clickable icon is not accessible.
 */
export const Icon: (props: IconProps) => React.ReactNode = ({
    name,
    className,
    title,
}) => (
    <span
        role={title ? "img" : undefined}
        aria-label={title}
        aria-hidden={!title || undefined}
        className={cn(styles.icon, styles[name], className)}
    />
);

export default Icon;
