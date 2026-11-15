import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../../utils/cn";
import type { IconName } from "../../../icons/registry";
import styles from "./Icon.module.css";

export type { IconName };
export { isIconName } from "../../../icons/registry";

export interface IconProps {
    /**
     * Icon name: a registry name (autocomplete) or any custom name with a
     * `--icon-<name>` token defined on the container — modules add
     * artwork by defining the token, not by editing the registry.
     */
    name: IconName | (string & {});
    /** CSS class name for additional styling */
    className?: string | undefined;
    /** Title / accessibility label for the icon */
    title?: string;
}

/** Names that can serve as a CSS custom-property identifier suffix. */
const CUSTOM_ICON_ID = /^[\w-]+$/;

function iconStyle(name: string): CSSProperties | undefined {
    if (!CUSTOM_ICON_ID.test(name)) return undefined;
    return { "--icon": `var(--icon-${name})` } as CSSProperties;
}

/**
 * Design-system icon: a masked span painted with currentColor. The glyph
 * comes from the `--icon-<name>` theme token, so hosts swap artwork and
 * recolor the set through the same token overrides as the rest of the
 * theme. Icon size is determined entirely by the parent container's CSS.
 * Interactive icons use IconButton — a clickable icon is not accessible.
 */
export const Icon: (props: IconProps) => ReactNode = ({
    name,
    className,
    title,
}) => (
    <span
        role={title ? "img" : undefined}
        aria-label={title}
        aria-hidden={!title || undefined}
        className={cn(styles.icon, className)}
        style={iconStyle(name)}
    />
);
