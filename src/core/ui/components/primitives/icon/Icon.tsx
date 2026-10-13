import React from "react";
import { cn } from "@core/ui/utils/cn";
import { isIconName } from "../../../icons/registry";
import type { IconName } from "../../../icons/registry";
import styles from "./Icon.module.css";

export type { IconName };
export { isIconName };

export interface IconProps {
    /**
     * Icon name: a registry name (autocomplete) or any custom name with a
     * `--icon-<name>` token defined on the container — modules add
     * artwork by defining the token, not by editing the registry.
     */
    name: IconName | (string & {});
    /** CSS class name for additional styling */
    className?: string;
    /** Title / accessibility label for the icon */
    title?: string;
}

/** Names that can serve as a CSS custom-property identifier suffix. */
const CUSTOM_ICON_ID = /^[\w-]+$/;

/**
 * Inline mask style for a non-registry icon name — the glyph comes from
 * the `--icon-<name>` token the host or a module defines. `undefined`
 * when the name cannot be a token identifier (no glyph renders).
 */
export function customIconStyle(name: string):
    | { maskImage: string; WebkitMaskImage: string }
    | undefined {
    if (!CUSTOM_ICON_ID.test(name)) return undefined;
    const token = `var(--icon-${name})`;
    return { maskImage: token, WebkitMaskImage: token };
}

/**
 * Design-system icon: a masked span painted with currentColor. The glyph
 * comes from the `--icon-<name>` theme token, so hosts swap artwork and
 * recolor the set through the same token overrides as the rest of the
 * theme; names outside the registry render through an inline mask-image
 * of the same token shape. Icon size is determined entirely by the parent
 * container's CSS. Interactive icons use IconButton — a clickable icon is
 * not accessible.
 */
export const Icon: (props: IconProps) => React.ReactNode = ({
    name,
    className,
    title,
}) => {
    const inRegistry = isIconName(name);
    return (
        <span
            role={title ? "img" : undefined}
            aria-label={title}
            aria-hidden={!title || undefined}
            className={cn(
                styles.icon,
                inRegistry ? styles[name] : undefined,
                className,
            )}
            style={inRegistry ? undefined : customIconStyle(name)}
        />
    );
};

export default Icon;
