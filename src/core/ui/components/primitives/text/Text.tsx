import type { ReactNode } from "react";
import { cn } from "../../../utils/cn";
import styles from "./Text.module.css";

export type TextVariant = "title" | "body" | "hint" | "caption";
export type TextTone =
    | "secondary"
    | "muted"
    | "accent"
    | "error"
    | "on-accent";
export type TextWeight = "semibold" | "bold";

export interface TextProps {
    /** Typographic variant: title — headings (xl/bold), body — base text
        (base/regular), hint — notes (xs/regular), caption — uppercase label
        (xs/semibold/uppercase). */
    variant?: TextVariant;
    /** Color override for semantic exceptions. */
    tone?: TextTone | undefined;
    /** Weight override. */
    weight?: TextWeight | undefined;
    /** Truncate long text with an ellipsis (nowrap + overflow + ellipsis). */
    truncate?: boolean;
    /** Remove the text from the accessibility tree (visual-only labels). */
    ariaHidden?: boolean;
    /** Element id — Field hints/errors are aria-describedby targets. */
    id?: string | undefined;
    /** ARIA role (Field errors announce as `alert`). */
    role?: string | undefined;
    children: ReactNode;
    className?: string | undefined;
}

/**
 * Design-system text. Single element for all text in src: typography tokens
 * are consumed here, consumers keep only layout.
 */
export const Text: (props: TextProps) => ReactNode = ({
    variant = "body",
    tone,
    weight,
    truncate,
    ariaHidden,
    id,
    role,
    children,
    className,
}) => (
    <span
        id={id}
        role={role}
        className={cn(
            styles.text,
            styles[variant],
            tone && styles[tone],
            weight && styles[weight],
            truncate && styles.truncate,
            className,
        )}
        aria-hidden={ariaHidden || undefined}
    >
        {children}
    </span>
);

